import * as THREE from 'three';
import { io } from 'socket.io-client';
import type { Emote, MilkResult, Move, PlayerInfo, ShearResult, Totals, Welcome } from '../../server/src/protocol';
import { buildWorld } from './world.js';
import { MOODS } from './moods.js';
import { makeSheep, setWool } from './sheepkit.js';
import { initInput, readInput } from './input';
import { initHud, say, setOnline, setTotals, showControls, toast, updateHud } from './hud';
import { createShear } from './shear';
import { initAnalytics, track } from './analytics';
import { inAppHint } from './inapp';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
let r: THREE.WebGLRenderer;
try { r = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { $('err').style.display = 'grid'; throw e; }
r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;

// ── 세계
const scene = new THREE.Scene();
const { solids } = buildWorld(scene, { ...MOODS.sunny, noPlayer: true, noQueue: true, noNpc: true }) as { solids: { x: number; z: number; r: number }[] };
scene.traverse((o: any) => { if (o.isDirectionalLight) o.shadow.mapSize.set(1024, 1024); });

const SHEEP = { legLen: 0.24, ears: 'up', woolGlow: 0xeef6ff, puffN: 60, puffR: 0.38, body: [1.12, 0.95, 1.05] };
const SHEEP_LITE = { ...SHEEP, puffN: 30, puffR: 0.5, jitter: 0 }; // 다른 양·NPC 양은 가볍게

// 원래 이 목장에 사는 NPC 양 5마리 (귀에 노란 태그, 접속자 수에는 안 셈)
[[7.5, -7, -0.4, 0.5], [-8.5, -2.5, 1.9, 0.7], [9, 2.5, -1.6, 0.9], [-6.5, 5.5, 2.4, 0.4], [3, -10, 0.3, 0.8]].forEach(([x, z, ry, w]) => {
  const s = makeSheep({ ...SHEEP_LITE, tag: true }); setWool(s, w); s.position.set(x, 0, z); s.rotation.y = ry; scene.add(s);
  solids.push({ x, z, r: 1.0 + w * 0.5 });
});

// ── 털 깎는 자리와 줄
const ZONE = new THREE.Vector3(-0.6, 0, -1.6);
const QDIR = new THREE.Vector3(0.6, 0, 0.8);
const slot = (i: number) => new THREE.Vector3().copy(ZONE).addScaledVector(QDIR, i * 2.7);
const ring = (color: number, at: THREE.Vector3) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.set(at.x, 0.03, at.z); scene.add(m); return m;
};
const shearRing = ring(0x3fbf5a, ZONE);

// ── 우유 짜는 자리와 NPC
const MILK = new THREE.Vector3(7, 0, -2.5);
const milkRing = ring(0x4aa3e0, MILK);
{
  const g = new THREE.Group(); g.position.set(MILK.x + 1.6, 0, MILK.z - 1.2); g.rotation.y = -0.8; scene.add(g);
  const M = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.45, 0.8, 8, 16), M(0xffffff), 0, 1.05, 0);
  add(new THREE.SphereGeometry(0.38, 24, 18), M(0xf2c9a8), 0, 2.05, 0);
  add(new THREE.SphereGeometry(0.4, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd8433b), 0, 2.12, 0);
  [-0.18, 0.18].forEach((x) => add(new THREE.CapsuleGeometry(0.15, 0.5, 6, 10), M(0x3b3b46), x, 0.35, 0));
  add(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.6, roughness: 0.3 }), 0.9, 0.25, 0.6);
  solids.push({ x: g.position.x, z: g.position.z, r: 0.6 });
}

// ── 내 양: root(위치·방향) → pivot(구르기 회전) → sheep
function makeBody(opts: any) {
  const root = new THREE.Group(), pivot = new THREE.Group(), sheep = makeSheep(opts);
  pivot.position.y = 1.15; sheep.position.y = -1.15; pivot.add(sheep); root.add(pivot); scene.add(root);
  return { root, pivot, sheep };
}
const me = makeBody(SHEEP);
me.root.visible = false;

const STAGES = [
  { speed: 5.6, max: 0.08 }, { speed: 4.6, max: 0.35 }, { speed: 3.6, max: 0.6 }, { speed: 2.4, max: 0.85 }, { speed: 0, max: 9 },
];
const STAGE_SAY = ['Fresh cut!', 'Sweet as.', 'Getting fluffy...', 'Heavy wool, phew!', 'Time to roll to the woolshed!'];

// ── 네트워크 상태
const uid = (() => { try { let u = localStorage.getItem('uid'); if (!u) { u = crypto.randomUUID(); localStorage.setItem('uid', u); } return u; } catch { return ''; } })();
initAnalytics(uid); inAppHint();
// 무료 서버가 잠들어 있으면 첫 접속이 오래 걸림 → 1.5초 안에 못 들어오면 '깨우는 중' 화면
const wakeT = setTimeout(() => { if (!joined) { $('wake').hidden = false; track('server_wake_wait'); } }, 1500);
const socket = io(import.meta.env.VITE_SERVER_URL || `${location.protocol}//${location.hostname}:3001`, { transports: ['websocket', 'polling'] });
let myId = '', offset = 0, growMs = 600_000, milkMs = 180_000, myWoolAt = 0, myMilkAt = 0, queue: string[] = [], joined = false;
const now = () => Date.now() + offset;
const woolOf = (at: number) => Math.min(1, Math.max(0, (now() - at) / growMs));

interface Remote { root: THREE.Group; pivot: THREE.Group; sheep: THREE.Group; tx: number; tz: number; try: number; st: number; woolAt: number; jumpV: number; jumpY: number; lean: number }
const others = new Map<string, Remote>();
function addOther(p: PlayerInfo) {
  if (p.id === myId || others.has(p.id)) return;
  const b = makeBody(SHEEP_LITE); b.root.position.set(p.x, 0, p.z); b.root.rotation.y = p.ry;
  others.set(p.id, { ...b, tx: p.x, tz: p.z, try: p.ry, st: p.st, woolAt: p.woolAt, jumpV: 0, jumpY: 0, lean: 0 });
}
function removeOther(id: string) { const o = others.get(id); if (o) { scene.remove(o.root); others.delete(id); } }

socket.on('connect', () => socket.emit('join', { uid }));
socket.on('welcome', (w: Welcome, self: PlayerInfo) => {
  for (const id of [...others.keys()]) removeOther(id);
  clearTimeout(wakeT); $('wake').hidden = true;
  myId = w.id; offset = w.now - Date.now(); growMs = w.growMs; milkMs = w.milkMs; myWoolAt = w.woolAt; myMilkAt = w.milkAt; queue = w.queue;
  w.players.forEach(addOther); setTotals(w.totals); setOnline(w.online);
  me.root.position.set(self.x, 0, self.z); me.root.visible = true; camPos(cam.position, self.x, self.z); lookAt.set(self.x, 1.4, self.z);
  if (mode !== 'walk') { shear.cancel(); mode = 'walk'; showControls(true); }
  if (joined) toast('Back online. Sweet as.', 2);
  if (!joined) { track('join', { channel: w.channel, online: w.online }); joined = true; toast(woolOf(myWoolAt) > 0.85 ? "You're a very woolly sheep. Roll to the green ring!" : "Kia ora! You're a sheep now. She'll be right.", 4.5); }
});
socket.on('joined', addOther);
socket.on('left', removeOther);
socket.on('moves', (ms: Move[]) => { for (const [id, x, z, ry, st] of ms) { const o = others.get(id); if (o) { o.tx = x; o.tz = z; o.try = ry; o.st = st; } } });
socket.on('queue', (q: string[]) => { queue = q; });
socket.on('sheared', (id: string, at: number) => { const o = others.get(id); if (o) { o.woolAt = at; shear.burst(o.root.position); } });
socket.on('totals', setTotals);
socket.on('online', setOnline);
socket.on('emote', (id: string, e: Emote) => { const o = others.get(id); if (o) playEmote(o, e); });
socket.on('disconnect', () => toast('Reconnecting...', 60));

// ── 감정 표현
const BAA = ['Baa~', 'Baaa!', 'Mehh~'];
function playEmote(o: { root: THREE.Group; jumpV?: number; lean?: number }, e: Emote) {
  if (e === 'baa') say(o.root, BAA[Math.floor(Math.random() * BAA.length)]);
  if (e === 'jump') o.jumpV = 6.5;
  if (e === 'nuzzle') { o.lean = 1; say(o.root, '♥'); }
}
let jumpV = 0, jumpY = 0, lean = 0, lastEmote = 0;
function emote(e: Emote) {
  if (mode === 'shear' || performance.now() - lastEmote < 450) return; lastEmote = performance.now();
  if (e === 'jump') { if (jumpY > 0.01 || mode !== 'walk') return; jumpV = stage === 4 ? 4 : 6.5; }
  else { const self = { root: me.root, lean: 0 }; playEmote(self, e); if (self.lean) lean = 1; }
  socket.emit('emote', e); track('emote', { e });
}
$('baa').addEventListener('click', () => emote('baa'));
$('jump').addEventListener('click', () => emote('jump'));
$('nuzzle').addEventListener('click', () => emote('nuzzle'));
initInput((code) => { if (code === 'Space') emote('jump'); if (code === 'KeyB') emote('baa'); if (code === 'KeyN') emote('nuzzle'); });
initHud();

// ── 카메라
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const lookAt = new THREE.Vector3();
// 카메라: 양 주위를 도는 궤도 (yaw 좌우, pitch 위아래, dist 거리). 드래그 = 둘러보기, 두 손가락·휠·버튼 = 줌
const DIST_MIN = 5, DIST_MAX = 34;
const view = { yaw: 0, pitch: 0.6, dist: 13.3, tYaw: 0, tPitch: 0.6, tDist: 13.3 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const setView = (d: number) => { view.tDist = clamp(d, DIST_MIN, DIST_MAX); };
const camPos = (out: THREE.Vector3, tx: number, tz: number) =>
  out.set(tx + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist, tz + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
{
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, dist0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (mode === 'shear') return;
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = view.tDist; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId); if (!prev || mode === 'shear') return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { view.tYaw -= dx * 0.007; view.tPitch = clamp(view.tPitch + dy * 0.005, 0.2, 1.35); }
    else if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; setView(dist0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); }
  });
  const end = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (mode !== 'shear') setView(view.tDist * (1 + e.deltaY * 0.0012)); }, { passive: false });
  $('zoomIn').addEventListener('click', () => setView(view.tDist / 1.5));
  $('zoomOut').addEventListener('click', () => setView(view.tDist * 1.5));
}
const size = () => { const w = innerWidth, h = innerHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 0.8 ? 52 : 40; cam.updateProjectionMatrix(); };
addEventListener('resize', size); size();
if (cam.aspect < 0.8) view.dist = view.tDist = 16;

// ── 털 깎기
type Mode = 'walk' | 'queue' | 'shear';
let mode: Mode = 'walk', stage = -1, shearWool = 1, leaveCool = 0, leaveHold = 0, milkHold = 0;
const shear = createShear({
  scene, cam, canvas, sheep: me.sheep, zone: ZONE, solids,
  onFinish(clean) {
    mode = 'walk'; showControls(true); myWoolAt = now(); vel.set(2.5, 0, 4);
    socket.emit('shear', { clean }, (res: ShearResult) => {
      myWoolAt = res.at;
      if (res.ok) track('shear', { earned: res.earned, clean });
      if (res.ok) toast(clean ? `Clean blow! Good as gold. +NZ$${res.earned}` : `Sweet as! +NZ$${res.earned} of wool`, 3);
    });
  },
});
function leaveQueue() { socket.emit('dequeue'); if (shear.state !== 'off') shear.cancel(); mode = 'walk'; showControls(true); leaveCool = 3; }

const vel = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), axis = new THREE.Vector3(), tmpV = new THREE.Vector3();
let yaw = Math.PI, sendT = 0, lastSent = '';
const clock = new THREE.Clock();
const angLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const P = me.root.position, raw = readInput();
  // 조이스틱은 화면 기준 → 카메라가 돈 만큼 세계 방향으로 돌린다
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
  const inp = { x: raw.x * cy + raw.z * sy, z: -raw.x * sy + raw.z * cy, len: raw.len };
  leaveCool = Math.max(0, leaveCool - dt);

  // 털 상태 (털 깎는 중에는 깎기 시작할 때 크기로 고정)
  const wool = mode === 'shear' ? shearWool : woolOf(myWoolAt);
  const s = STAGES.findIndex((x) => wool < x.max);
  if (s !== stage) { if (stage !== -1 && s > stage && mode === 'walk') toast(STAGE_SAY[s]); stage = s; }
  setWool(me.sheep, wool);

  const qi = queue.indexOf(myId);
  if (mode !== 'walk' && qi === -1 && shear.state !== 'finish' && joined) { // 줄에서 밀려남
    if (shear.state !== 'off') shear.cancel(); mode = 'walk'; showControls(true); leaveCool = 2; socket.emit('dequeue');
  }

  if (mode === 'shear') {
    // 엉덩이로 앉아 배가 보이는 자세 (실제 털 깎기 자세)
    vel.set(0, 0, 0); P.x += (ZONE.x - P.x) * Math.min(1, dt * 6); P.z += (ZONE.z - P.z) * Math.min(1, dt * 6);
    yaw = angLerp(yaw, 0, Math.min(1, dt * 6));
    tmpQ.setFromAxisAngle(axis.set(1, 0, 0), shear.state === 'shear' ? -0.95 : 0);
    me.pivot.quaternion.slerp(tmpQ, Math.min(1, dt * 5)); me.sheep.rotation.z = 0;
  } else if (mode === 'queue') {
    // 줄 서기: 내 순서 자리까지 알아서 걸어간다. 조이스틱을 세게 밀면 줄에서 나온다
    const target = slot(Math.max(0, qi)); tmpV.copy(target).sub(P); tmpV.y = 0;
    const d = tmpV.length(); if (d > 0.05) { tmpV.multiplyScalar(Math.min(d, 3.2 * dt) / d); P.add(tmpV); yaw = angLerp(yaw, Math.atan2(tmpV.x, tmpV.z), Math.min(1, dt * 8)); }
    else yaw = angLerp(yaw, Math.atan2(-QDIR.x, -QDIR.z), Math.min(1, dt * 6));
    vel.set(0, 0, 0); me.pivot.quaternion.slerp(tmpQ.identity(), Math.min(1, dt * 6)); me.sheep.rotation.z = 0;
    if (qi === 0 && d < 0.4) { mode = 'shear'; shearWool = wool; shear.enter(wool); showControls(false); toast('Swipe over the wool to shear!', 4); }
    else if (qi > 0) { leaveHold = inp.len > 0.7 ? leaveHold + dt : 0; if (leaveHold > 0.5) { leaveHold = 0; leaveQueue(); } }
  } else if (stage === 4) {
    // 구름 공: 걷지 못하고 굴러서만 이동. 관성이 있어 방향 바꾸기가 살짝 어렵다
    vel.x += inp.x * 9 * dt; vel.z += inp.z * 9 * dt; vel.multiplyScalar(Math.pow(0.55, dt));
    const sp = Math.hypot(vel.x, vel.z); if (sp > 6) vel.multiplyScalar(6 / sp);
    if (sp > 0.05) { axis.set(vel.z, 0, -vel.x).normalize(); tmpQ.setFromAxisAngle(axis, sp * dt / 1.15); me.pivot.quaternion.premultiply(tmpQ); }
  } else {
    const spd = STAGES[stage].speed;
    vel.x += (inp.x * spd - vel.x) * Math.min(1, dt * 10); vel.z += (inp.z * spd - vel.z) * Math.min(1, dt * 10);
    me.pivot.quaternion.slerp(tmpQ.identity(), Math.min(1, dt * 6));
    if (inp.len > 0.1) yaw = angLerp(yaw, Math.atan2(inp.x, inp.z), Math.min(1, dt * 10));
    me.sheep.rotation.z = (inp.len > 0.1 ? Math.sin(t * (14 - stage * 2)) * (0.03 + stage * 0.04) : 0) + Math.sin(lean * Math.PI) * 0.35; // 뒤뚱뒤뚱 + 비비기
  }
  if (!(stage === 4 && mode === 'walk')) me.root.rotation.y = yaw;
  lean = Math.max(0, lean - dt * 1.6);

  if (mode === 'walk') {
    P.x += vel.x * dt; P.z += vel.z * dt;
    // 충돌: 나무·헛간·NPC·다른 양. 구를 땐 통통 튕긴다
    const myR = 0.9 + wool * 0.5;
    const bump = (ox: number, oz: number, or: number) => {
      const dx = P.x - ox, dz = P.z - oz, d = Math.hypot(dx, dz), m = myR + or;
      if (d < m && d > 0.0001) { const nx = dx / d, nz = dz / d; P.x = ox + nx * m; P.z = oz + nz * m; const vn = vel.x * nx + vel.z * nz; if (vn < 0) { const k = stage === 4 ? 1.8 : 1; vel.x -= k * vn * nx; vel.z -= k * vn * nz; } }
    };
    for (const o of solids) bump(o.x, o.z, o.r);
    for (const o of others.values()) bump(o.root.position.x, o.root.position.z, 0.8 + woolOf(o.woolAt) * 0.4);
    const R = Math.hypot(P.x, P.z); if (R > 15) { P.x *= 15 / R; P.z *= 15 / R; vel.multiplyScalar(-0.5); }

    // 털 깎기 줄에 서기: 깎는 자리나 줄 맨 끝 근처에 가면 자동으로 선다
    if (joined && wool > 0.2 && leaveCool <= 0) {
      const tail = slot(queue.length);
      if (Math.hypot(P.x - ZONE.x, P.z - ZONE.z) < 2.6 || (queue.length > 0 && Math.hypot(P.x - tail.x, P.z - tail.z) < 2.0)) {
        mode = 'queue'; leaveHold = 0; socket.emit('enqueue'); queue = [...queue, myId];
        if (queue.length > 1) toast(`In the queue: ${queue.length - 1} ahead. Push the stick to leave.`, 3);
      }
    }
    // 우유 짜기: 파란 링 안에서 2초 가만히
    const milkReady = now() - myMilkAt >= milkMs;
    if (joined && milkReady && Math.hypot(P.x - MILK.x, P.z - MILK.z) < 1.3 && Math.hypot(vel.x, vel.z) < 1.2) {
      if (milkHold === 0) toast('Milking... hold still!', 2);
      milkHold += dt;
      if (milkHold > 2) { milkHold = 0; myMilkAt = now(); socket.emit('milk', (res: MilkResult) => { myMilkAt = res.at; if (res.ok) track('milk'); if (res.ok) toast(`Fresh sheep milk! +NZ$${res.earned}`, 3); }); }
    } else milkHold = 0;
    milkRing.material.opacity = milkReady ? 0.55 + Math.sin(t * 4) * 0.3 : 0.15;
  }
  shearRing.material.opacity = wool > 0.2 ? 0.55 + Math.sin(t * 4) * 0.3 : 0.15;

  // 점프
  jumpV -= 18 * dt; jumpY = Math.max(0, jumpY + jumpV * dt); if (jumpY === 0) jumpV = 0;
  const hop = stage === 0 && inp.len > 0.1 && mode === 'walk' ? Math.abs(Math.sin(t * 9)) * 0.35 : 0;
  P.y = mode === 'shear' ? 0 : jumpY + hop;

  // 다른 양들
  for (const o of others.values()) {
    const op = o.root.position, dx = o.tx - op.x, dz = o.tz - op.z, k = Math.min(1, dt * 10), mx = dx * k, mz = dz * k;
    op.x += mx; op.z += mz; setWool(o.sheep, woolOf(o.woolAt));
    if (o.st === 4) { const d = Math.hypot(mx, mz); if (d > 0.001) { axis.set(mz, 0, -mx).normalize(); tmpQ.setFromAxisAngle(axis, d / 1.15); o.pivot.quaternion.premultiply(tmpQ); } }
    else { tmpQ.setFromAxisAngle(axis.set(1, 0, 0), o.st === 5 ? -0.95 : 0); o.pivot.quaternion.slerp(tmpQ, Math.min(1, dt * 6)); o.root.rotation.y = angLerp(o.root.rotation.y, o.try, Math.min(1, dt * 8)); }
    o.jumpV -= 18 * dt; o.jumpY = Math.max(0, o.jumpY + o.jumpV * dt); if (o.jumpY === 0) o.jumpV = 0; op.y = o.jumpY;
    o.lean = Math.max(0, o.lean - dt * 1.6); o.sheep.rotation.z = Math.sin(o.lean * Math.PI) * 0.35;
  }

  // 내 위치 보내기 (0.1초마다, 바뀌었을 때만)
  sendT += dt;
  if (joined && sendT > 0.1) {
    sendT = 0;
    const st = mode === 'shear' ? 5 : stage === 4 && mode === 'walk' ? 4 : Math.hypot(vel.x, vel.z) > 0.2 || mode === 'queue' ? 1 : 0;
    const m = [+P.x.toFixed(2), +P.z.toFixed(2), +me.root.rotation.y.toFixed(2), st], key = m.join();
    if (key !== lastSent) { lastSent = key; socket.emit('m', m); }
  }

  // 카메라: 평소엔 따라가고, 털 깎을 땐 양 앞으로 다가간다
  if (mode === 'shear') { cam.position.lerp(tmpV.set(ZONE.x + 0.5, 3.6, ZONE.z + 8.2), Math.min(1, dt * 3)); lookAt.lerp(tmpV.set(ZONE.x + 0.2, 1.5, ZONE.z), Math.min(1, dt * 3)); }
  else {
    const e = Math.min(1, dt * 8);
    view.yaw += (view.tYaw - view.yaw) * e; view.pitch += (view.tPitch - view.pitch) * e; view.dist += (view.tDist - view.dist) * e;
    camPos(tmpV, P.x, P.z); cam.position.lerp(tmpV, Math.min(1, dt * 6)); lookAt.lerp(tmpV.set(P.x, 1.4, P.z), Math.min(1, dt * 6));
  }
  cam.lookAt(lookAt);

  shear.update(dt); updateHud(dt, cam);
  r.render(scene, cam);
  requestAnimationFrame(loop);
}
loop();

if (location.search.includes('debug')) (window as any).__dbg = { me, others, cam, puffs: me.sheep.userData.puffs, get mode() { return mode; }, get queue() { return queue; }, get stage() { return stage; }, ZONE, MILK };
