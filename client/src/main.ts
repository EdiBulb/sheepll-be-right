import * as THREE from 'three';
import { io } from 'socket.io-client';
import type { Emote, GameState, MilkResult, Move, PlayerInfo, ShearResult, Totals, VoteResult, Welcome } from '../../server/src/protocol';
import { CATALOG, FARMS, GATHER, SHORE_Z, WORLD_R } from '../../server/src/shared';
import { PLACES, buildLand, heightAt } from './land';
import { animate, makeSheep, setWool } from './sheepkit.js';
import { createDog } from './dog';
import { drawFarm, renderNz, renderVote } from './mapui';
import { initInput, readInput } from './input';
import { initHud, say, setOnline, setPlace, setTotals, showControls, toast, updateHud } from './hud';
import { createShear } from './shear';
import { initAnalytics, track } from './analytics';
import { inAppHint } from './inapp';
import { createSound } from './sound';
import { compose, grab, share } from './photo';
import { createSky } from './sky';
import { bakeStatic } from './bake';
import { markVisit, save, store, today } from './store';
import { ITEMS, wear } from './wardrobe';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
let r: THREE.WebGLRenderer;
try { r = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { $('err').style.display = 'grid'; throw e; }
r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;

// ── 세계: 어느 농장(도시)인지는 이 탭에 기억해 둔다
const farm = (() => { try { const f = sessionStorage.getItem('farm'); return FARMS.some((x) => x.id === f) ? f! : 'auckland'; } catch { return 'auckland'; } })();
setPlace(FARMS.find((f) => f.id === farm)!.name);
function goFarm(id: string) { try { sessionStorage.setItem('farm', id); } catch { /* 무시 */ } location.reload(); }
// 초대 링크(?f=코드)로 들어오면 그 친구와 같은 코드로 묶인다
{ const q = new URLSearchParams(location.search), f = q.get('f'); if (f && /^[a-z0-9]{4,12}$/i.test(f)) { store.party = f.toLowerCase(); save(); q.delete('f'); const rest = q.toString(); history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '')); } }

const scene = new THREE.Scene();
const land = buildLand(scene, farm);
const { solids } = land;

const SHEEP = { legLen: 0.24, ears: 'up', woolGlow: 0xeef6ff, puffN: 60, puffR: 0.38, body: [1.12, 0.95, 1.05] };
const SHEEP_LITE = { ...SHEEP, puffN: 26, puffR: 0.52, jitter: 0 }; // 다른 양은 가볍게

// ── 털 깎는 자리와 줄
const ZONE = new THREE.Vector3(-0.6, 0, -1.6);
const QDIR = new THREE.Vector3(0.6, 0, 0.8);
const slot = (i: number) => new THREE.Vector3().copy(ZONE).addScaledVector(QDIR, i * 2.7);
const ring = (color: number, at: THREE.Vector3) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.set(at.x, heightAt(at.x, at.z) + 0.06, at.z); m.userData.dynamic = true; scene.add(m); return m;
};
const shearRing = ring(0x3fbf5a, ZONE);

// ── 우유 짜는 자리 (우유 헛간 앞)
const MILK = new THREE.Vector3(PLACES.milk.x, 0, PLACES.milk.z);
const milkRing = ring(0x4aa3e0, MILK);

// 움직이지 않는 것(땅·나무·울타리·헛간·NPC)은 합쳐서 그리기 횟수를 줄인다. 구름·새는 움직이므로 빼고.
const sky = createSky(scene, land.clouds);
bakeStatic(scene);
const dog = createDog(scene);

// ── 소리
const sound = createSound();
sound.setOn(store.soundOn);
const renderSoundBtn = () => {
  $('soundWaves').toggleAttribute('hidden', !store.soundOn); $('soundX').toggleAttribute('hidden', store.soundOn);
  $('soundBtn').setAttribute('aria-label', store.soundOn ? 'Turn sound off' : 'Turn sound on');
};
renderSoundBtn();
$('soundBtn').addEventListener('click', () => { store.soundOn = !store.soundOn; save(); sound.setOn(store.soundOn); renderSoundBtn(); track('sound_toggled', { on: store.soundOn }); });
addEventListener('pointerdown', () => { if (store.soundOn && !sound.started) sound.unlock(); }, { capture: true });
document.addEventListener('visibilitychange', () => (document.hidden ? sound.pause() : sound.resume()));

// ── 내 양: root(위치·방향) → pivot(구르기 회전) → sheep
function makeBody(opts: any) {
  const root = new THREE.Group(), pivot = new THREE.Group(), sheep = makeSheep(opts);
  pivot.position.y = 1.15; sheep.position.y = -1.15; pivot.add(sheep); root.add(pivot); scene.add(root);
  return { root, pivot, sheep };
}
// 친구(같은 초대 코드) 머리 위에 뜨는 작은 하트
const heartTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; g.fillStyle = '#ff7fa8'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(-8, 28, 12, 0, 32, 20); g.bezierCurveTo(52, 0, 72, 28, 32, 56); g.fill(); return new THREE.CanvasTexture(c); })();
function heart(root: THREE.Group) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, depthTest: false })); sp.scale.set(0.7, 0.7, 1); sp.position.y = 3.6; sp.renderOrder = 5; root.add(sp); }
const me = makeBody(SHEEP);
wear(me.sheep, store.wearing);
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
let gstate: GameState = { vault: 0, built: [], vote: { open: false, options: [], counts: {} } }, voted = store.voteDay === today(), herding = false;
const now = () => Date.now() + offset;
const woolOf = (at: number) => Math.min(1, Math.max(0, (now() - at) / growMs));

interface Remote { root: THREE.Group; pivot: THREE.Group; sheep: THREE.Group; tx: number; tz: number; try: number; st: number; woolAt: number; jumpV: number; jumpY: number; lean: number; grazeK: number; restK: number; friend: boolean }
const others = new Map<string, Remote>();
function addOther(p: PlayerInfo) {
  if (p.id === myId || others.has(p.id)) return;
  const b = makeBody(SHEEP_LITE); b.root.position.set(p.x, heightAt(p.x, p.z), p.z); b.root.rotation.y = p.ry; wear(b.sheep, p.acc);
  const friend = !!store.party && p.party === store.party; if (friend) heart(b.root);
  others.set(p.id, { ...b, tx: p.x, tz: p.z, try: p.ry, st: p.st, woolAt: p.woolAt, jumpV: 0, jumpY: 0, lean: 0, grazeK: 0, restK: 0, friend });
}
function removeOther(id: string) { const o = others.get(id); if (o) { scene.remove(o.root); others.delete(id); } }

socket.on('connect', () => socket.emit('join', { uid, acc: store.wearing, farm, party: store.party }));
socket.on('welcome', (w: Welcome, self: PlayerInfo) => {
  for (const id of [...others.keys()]) removeOther(id);
  if (w.farm !== farm) { goFarm(w.farm); return; } // 아직 안 지어진 농장이면 서버가 오클랜드로 보낸다
  clearTimeout(wakeT); $('wake').hidden = true;
  setState(w.state); voted = voted || w.voted; herding = w.herd; dog.show(w.herd);
  myId = w.id; offset = w.now - Date.now(); growMs = w.growMs; milkMs = w.milkMs; myWoolAt = w.woolAt; myMilkAt = w.milkAt; queue = w.queue;
  w.players.forEach(addOther); setTotals(w.totals); ships = Math.floor(w.totals.money / 10_000); setOnline(w.online);
  me.root.position.set(self.x, heightAt(self.x, self.z), self.z); me.root.visible = true; camPos(cam.position, self.x, self.z); lookAt.set(self.x, 1.4, self.z);
  if (mode !== 'walk') { shear.cancel(); mode = 'walk'; showControls(true); }
  if (joined) toast('Back online. Sweet as.', 2);
  if (markVisit()) checkUnlocks();
  if (!joined) { track('join', { farm, channel: w.channel, online: w.online, friends: !!store.party }); joined = true; if (store.tut >= 3 || woolOf(myWoolAt) <= 0.85) { if (store.tut < 3) { store.tut = 3; save(); } toast("Kia ora! You're a sheep now. She'll be right.", 4); } }
});
socket.on('joined', addOther);
socket.on('left', removeOther);
socket.on('moves', (ms: Move[]) => { for (const [id, x, z, ry, st] of ms) { const o = others.get(id); if (o) { o.tx = x; o.tz = z; o.try = ry; o.st = st; } } });
socket.on('queue', (q: string[]) => { queue = q; });
socket.on('sheared', (id: string, at: number) => { const o = others.get(id); if (o) { o.woolAt = at; shear.burst(o.root.position); } });
let ships = -1;
socket.on('totals', (t: Totals, st?: GameState) => {
  setTotals(t); if (st) setState(st);
  const n = Math.floor(t.money / 10_000);
  if (ships >= 0 && n > ships) { toast('A ship is sailing with our wool! Good as gold.', 3.5); sound.horn(); shipT = 0; track('ship_sailed', { ships: n }); }
  ships = n;
});
// ── 금고·투표·지어진 것
function setState(st: GameState) {
  gstate = st;
  for (const id of st.built) land.addBuilding(id);
  if (!$('mapPanel').hidden) renderMapPanel();
}
socket.on('state', setState);
socket.on('built', (id: string, st: GameState) => {
  setState(st); voted = false; store.voteDay = ''; save();
  const c = CATALOG.find((x) => x.id === id); if (!c) return;
  toast(c.kind === 'farm' ? `The flock built ${c.name}! Open the map to visit.` : `The flock built it: ${c.name}!`, 5); sound.chime(); track('built', { id });
});
// ── 양몰이: 서버가 개 위치를 보내 준다
socket.on('herd', (on: boolean, allHome?: boolean) => {
  herding = on; dog.show(on);
  if (on) { toast('Here comes Bess the sheepdog! Back to the yard, everyone.', 4.5); sound.bark(); track('herd_start'); }
  else { toast(allHome ? "Good dog, Bess! Everyone's home." : 'Bess gives up. Cheeky sheep.', 3.5); track('herd_end', { allHome: !!allHome, home: Math.hypot(me.root.position.x - GATHER.x, me.root.position.z - GATHER.z) < 14 }); }
});
socket.on('dog', (d: [number, number, number]) => { if (!dog.on) dog.show(true); dog.set(d[0], d[1], d[2]); });
socket.on('wear', (id: string, acc: string) => { const o = others.get(id); if (o) wear(o.sheep, acc); });
socket.on('online', setOnline);
socket.on('emote', (id: string, e: Emote) => { const o = others.get(id); if (!o) return; playEmote(o, e); soundAt(o.root.position, e); });
/** 다른 양의 소리: 멀수록 작게, 화면 왼쪽/오른쪽에 따라 좌우로 */
const sv = new THREE.Vector3();
function soundAt(pos: THREE.Vector3, e: Emote) {
  const d = pos.distanceTo(me.root.position), vol = Math.max(0, 1 - d / 40);
  sv.copy(pos).project(cam); const pan = Math.max(-0.9, Math.min(0.9, sv.x));
  if (e === 'baa') sound.baa(vol * 0.8, pan, 0.9 + Math.random() * 0.25);
  else if (e === 'nuzzle' && vol > 0.5) sound.nuzzle();
}
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
  if (e === 'jump') setPose('none');
  if (e === 'jump') { if (jumpY > 0.01 || mode !== 'walk') return; jumpV = stage === 4 ? 4 : 6.5; }
  else { const self = { root: me.root, lean: 0 }; playEmote(self, e); if (self.lean) lean = 1; }
  if (e === 'baa') sound.baa(1, 0, 1); else if (e === 'jump') sound.jump(); else sound.nuzzle();
  store.emotes++; save();
  socket.emit('emote', e); track('emote', { e });
}
$('baa').addEventListener('click', () => emote('baa'));
$('jump').addEventListener('click', () => emote('jump'));
$('nuzzle').addEventListener('click', () => emote('nuzzle'));
// ── 풀 뜯기와 쉬기: 느긋하게 지낼수록 행복이 쌓이고, 행복한 양의 털이 더 값지다
type Pose = 'none' | 'graze' | 'rest';
let pose: Pose = 'none', poseT = 0, grazeK = 0, restK = 0, munchT = 0, zzzT = 0;
function setPose(p: Pose) {
  if (p === pose) return;
  pose = p; poseT = 0; zzzT = 0;
  $('graze').setAttribute('aria-pressed', String(p === 'graze')); $('rest').setAttribute('aria-pressed', String(p === 'rest'));
  if (p !== 'none') track('pose', { p });
}
$('graze').addEventListener('click', () => {
  if (mode !== 'walk') return;
  if (stage === 4 && pose !== 'graze') { toast("Too woolly to reach the grass! Roll to the woolshed first.", 3); return; }
  setPose(pose === 'graze' ? 'none' : 'graze');
});
$('rest').addEventListener('click', () => { if (mode === 'walk') setPose(pose === 'rest' ? 'none' : 'rest'); });
initInput((code) => { if (code === 'Space') emote('jump'); if (code === 'KeyB') emote('baa'); if (code === 'KeyN') emote('nuzzle'); if (code === 'KeyG') $('graze').click(); if (code === 'KeyR') $('rest').click(); });
initHud();

// ── 카메라
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 700);
const lookAt = new THREE.Vector3();
// 카메라: 양 주위를 도는 궤도 (yaw 좌우, pitch 위아래, dist 거리). 드래그 = 둘러보기, 두 손가락·휠·버튼 = 줌
const DIST_MIN = 5, DIST_MAX = 60;
const view = { yaw: 0, pitch: 0.6, dist: 13.3, tYaw: 0, tPitch: 0.6, tDist: 13.3 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const setView = (d: number) => { view.tDist = clamp(d, DIST_MIN, DIST_MAX); };
const camPos = (out: THREE.Vector3, tx: number, tz: number) =>
  out.set(tx + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, heightAt(tx, tz) + Math.sin(view.pitch) * view.dist, tz + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
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
  onCut: () => sound.cut(), onBuzz: (on) => sound.clipper(on), onBale: () => sound.thump(),
  onFinish(clean) {
    mode = 'walk'; showControls(true); myWoolAt = now(); vel.set(2.5, 0, 4);
    socket.emit('shear', { clean, happy: store.happy }, (res: ShearResult) => {
      myWoolAt = res.at;
      if (res.ok) {
        track('shear', { earned: res.earned, clean }); sound.chime();
        store.happy = 0; happyTold = false; if (store.tut < 2) { store.tut = 2; tutT = 0; }
        store.shears++; if (clean) store.cleanBlows++; store.earned += res.earned; store.kg = Math.round((store.kg + 4.5 * Math.min(1, shearWool / 0.85)) * 10) / 10; save(); checkUnlocks();
      }
      if (res.ok) toast(`${clean ? 'Clean blow! Good as gold.' : 'Sweet as!'} +NZ$${res.earned}${res.happy ? ` (happy wool +$${res.happy})` : ''}`, 3.5);
    });
  },
});
function leaveQueue() { socket.emit('dequeue'); if (shear.state !== 'off') shear.cancel(); mode = 'walk'; showControls(true); leaveCool = 3; }

const vel = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), axis = new THREE.Vector3(), tmpV = new THREE.Vector3();
let yaw = Math.PI, sendT = 0, lastSent = '', lastBounce = 0, shipT = -1, uiT = 0, tutT = 0, happyTold = store.happy >= 1, barkT = 0;
const SHIP0 = land.ship.position.clone();
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
  if (mode !== 'walk' || raw.len > 0.3 || (stage === 4 && pose === 'graze')) setPose('none');
  grazeK += ((pose === 'graze' ? 1 : 0) - grazeK) * Math.min(1, dt * 5); restK += ((pose === 'rest' ? 1 : 0) - restK) * Math.min(1, dt * 4);
  const asleep = pose === 'rest' && poseT > 6;
  animate(me.sheep, t, grazeK, asleep);
  if (pose !== 'none') {
    poseT += dt;
    // 다른 양(친구든 목장 양이든) 곁에 있으면 더 행복하다
    let near = false; for (const o of others.values()) if (o.root.position.distanceToSquared(P) < 49) { near = true; break; }
    if (!near) for (const n of land.npcs) if ((n.x - P.x) ** 2 + (n.z - P.z) ** 2 < 49) { near = true; break; }
    store.happy = Math.min(1, store.happy + (dt / (pose === 'graze' ? 50 : 40)) * (near ? 1.6 : 1));
    if (store.happy >= 1 && !happyTold) { happyTold = true; save(); toast("You're one happy sheep. Happy wool is worth more!", 3.5); }
    if (pose === 'graze') { munchT -= dt; if (munchT <= 0) { munchT = 0.9; sound.munch(); } }
    if (asleep) { zzzT -= dt; if (zzzT <= 0) { zzzT = 3.2; say(me.root, 'z z z'); save(); } }
  }

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
    // 언덕에서는 내리막으로 저절로 굴러 내려간다
    const gx = heightAt(P.x + 0.6, P.z) - heightAt(P.x - 0.6, P.z), gz = heightAt(P.x, P.z + 0.6) - heightAt(P.x, P.z - 0.6);
    vel.x += (inp.x * 10 - gx * 9) * dt; vel.z += (inp.z * 10 - gz * 9) * dt; vel.multiplyScalar(Math.pow(0.6, dt));
    const sp = Math.hypot(vel.x, vel.z); if (sp > 12) vel.multiplyScalar(12 / sp);
    if (sp > 0.05) { axis.set(vel.z, 0, -vel.x).normalize(); tmpQ.setFromAxisAngle(axis, sp * dt / 1.15); me.pivot.quaternion.premultiply(tmpQ); }
  } else {
    const spd = STAGES[stage].speed;
    const mv = pose === 'none' ? spd : 0;
    vel.x += (inp.x * mv - vel.x) * Math.min(1, dt * 10); vel.z += (inp.z * mv - vel.z) * Math.min(1, dt * 10);
    me.pivot.quaternion.slerp(tmpQ.identity(), Math.min(1, dt * 6));
    if (inp.len > 0.1) yaw = angLerp(yaw, Math.atan2(inp.x, inp.z), Math.min(1, dt * 10));
    me.sheep.rotation.z = (inp.len > 0.1 ? Math.sin(t * (14 - stage * 2)) * (0.03 + stage * 0.04) : 0) + Math.sin(lean * Math.PI) * 0.35; // 뒤뚱뒤뚱 + 비비기
  }
  if (!(stage === 4 && mode === 'walk')) me.root.rotation.y = yaw;
  lean = Math.max(0, lean - dt * 1.6);

  if (mode === 'walk') {
    if (herding && dog.on) { // 개가 가까이 오면 반대쪽(마당 쪽)으로 밀려난다
      const dx = P.x - dog.group.position.x, dz = P.z - dog.group.position.z, d = Math.hypot(dx, dz);
      if (d < 7 && Math.hypot(P.x - GATHER.x, P.z - GATHER.z) > 12) {
        setPose('none'); const k = (22 * dt) / Math.max(d, 0.5); vel.x += dx * k; vel.z += dz * k;
        barkT -= dt; if (barkT <= 0) { barkT = 1.3; sound.bark(); say(dog.group, 'Woof!', 2); }
      }
    }
    P.x += vel.x * dt; P.z += vel.z * dt;
    // 충돌: 나무·헛간·NPC·다른 양. 구를 땐 통통 튕긴다
    const myR = 0.9 + wool * 0.5;
    const bump = (ox: number, oz: number, or: number) => {
      const dx = P.x - ox, dz = P.z - oz, d = Math.hypot(dx, dz), m = myR + or;
      if (d < m && d > 0.0001) { const nx = dx / d, nz = dz / d; P.x = ox + nx * m; P.z = oz + nz * m; const vn = vel.x * nx + vel.z * nz; if (vn < 0) { const k = stage === 4 ? 1.8 : 1; vel.x -= k * vn * nx; vel.z -= k * vn * nz; if (stage === 4 && vn < -1.2 && t - lastBounce > 0.25) { lastBounce = t; sound.bounce(); } } }
    };
    for (const o of solids) bump(o.x, o.z, o.r);
    for (const o of others.values()) bump(o.root.position.x, o.root.position.z, 0.8 + woolOf(o.woolAt) * 0.4);
    const R = Math.hypot(P.x, P.z); if (R > WORLD_R) { P.x *= WORLD_R / R; P.z *= WORLD_R / R; vel.multiplyScalar(-0.3); }
    if (P.z < SHORE_Z) { P.z = SHORE_Z; vel.z = Math.abs(vel.z) * 0.3; } // 바닷가에서 멈춤

    // 털 깎기 줄에 서기: 깎는 자리나 줄 맨 끝 근처에 가면 자동으로 선다
    if (joined && wool > 0.2 && leaveCool <= 0) {
      const tail = slot(queue.length);
      if (Math.hypot(P.x - ZONE.x, P.z - ZONE.z) < 2.6 || (queue.length > 0 && Math.hypot(P.x - tail.x, P.z - tail.z) < 2.0)) {
        mode = 'queue'; leaveHold = 0; socket.emit('enqueue'); queue = [...queue, myId];
        if (queue.length > 1) toast(`In the queue: ${queue.length - 1} ahead. Push the stick to leave.`, 3);
        if (store.tut < 1) store.tut = 1;
      }
    }
    // 우유 짜기: 파란 링 안에서 2초 가만히
    const milkReady = now() - myMilkAt >= milkMs;
    if (joined && milkReady && Math.hypot(P.x - MILK.x, P.z - MILK.z) < 1.3 && Math.hypot(vel.x, vel.z) < 1.2) {
      if (milkHold === 0) toast('Milking... hold still!', 2);
      milkHold += dt;
      if (milkHold > 2) { milkHold = 0; myMilkAt = now(); socket.emit('milk', (res: MilkResult) => { myMilkAt = res.at; if (res.ok) { track('milk'); sound.milk(); store.milks++; store.litres = Math.round((store.litres + 0.5) * 10) / 10; store.earned += res.earned; save(); checkUnlocks(); } if (res.ok) toast(`Fresh sheep milk! +NZ$${res.earned}`, 3); }); }
    } else milkHold = 0;
    milkRing.material.opacity = milkReady ? 0.55 + Math.sin(t * 4) * 0.3 : 0.15;
  }
  shearRing.material.opacity = wool > 0.2 ? 0.55 + Math.sin(t * 4) * 0.3 : 0.15;

  // 점프
  jumpV -= 18 * dt; jumpY = Math.max(0, jumpY + jumpV * dt); if (jumpY === 0) jumpV = 0;
  const hop = stage === 0 && inp.len > 0.1 && mode === 'walk' ? Math.abs(Math.sin(t * 9)) * 0.35 : 0;
  const ground = heightAt(P.x, P.z);
  P.y = ground + (mode === 'shear' ? 0 : jumpY + hop - restK * 0.3);

  // 다른 양들
  for (const o of others.values()) {
    const op = o.root.position, dx = o.tx - op.x, dz = o.tz - op.z, k = Math.min(1, dt * 10), mx = dx * k, mz = dz * k;
    op.x += mx; op.z += mz; setWool(o.sheep, woolOf(o.woolAt));
    o.grazeK += ((o.st === 2 ? 1 : 0) - o.grazeK) * Math.min(1, dt * 5); o.restK += ((o.st === 3 ? 1 : 0) - o.restK) * Math.min(1, dt * 4);
    animate(o.sheep, t, o.grazeK, o.restK > 0.9);
    if (o.st === 4) { const d = Math.hypot(mx, mz); if (d > 0.001) { axis.set(mz, 0, -mx).normalize(); tmpQ.setFromAxisAngle(axis, d / 1.15); o.pivot.quaternion.premultiply(tmpQ); } }
    else { tmpQ.setFromAxisAngle(axis.set(1, 0, 0), o.st === 5 ? -0.95 : 0); o.pivot.quaternion.slerp(tmpQ, Math.min(1, dt * 6)); o.root.rotation.y = angLerp(o.root.rotation.y, o.try, Math.min(1, dt * 8)); }
    o.jumpV -= 18 * dt; o.jumpY = Math.max(0, o.jumpY + o.jumpV * dt); if (o.jumpY === 0) o.jumpV = 0; op.y = heightAt(op.x, op.z) + o.jumpY - o.restK * 0.3;
    o.lean = Math.max(0, o.lean - dt * 1.6); o.sheep.rotation.z = Math.sin(o.lean * Math.PI) * 0.35;
  }

  // 내 위치 보내기 (0.1초마다, 바뀌었을 때만)
  sendT += dt;
  if (joined && sendT > 0.1) {
    sendT = 0;
    const st = mode === 'shear' ? 5 : pose === 'graze' ? 2 : pose === 'rest' ? 3 : stage === 4 && mode === 'walk' ? 4 : Math.hypot(vel.x, vel.z) > 0.2 || mode === 'queue' ? 1 : 0;
    const m = [+P.x.toFixed(2), +P.z.toFixed(2), +me.root.rotation.y.toFixed(2), st], key = m.join();
    if (key !== lastSent) { lastSent = key; socket.emit('m', m); }
  }

  // 카메라: 평소엔 따라가고, 털 깎을 땐 양 앞으로 다가간다
  if (mode === 'shear') { cam.position.lerp(tmpV.set(ZONE.x + 0.5, 3.6, ZONE.z + 8.2), Math.min(1, dt * 3)); lookAt.lerp(tmpV.set(ZONE.x + 0.2, 1.5, ZONE.z), Math.min(1, dt * 3)); }
  else {
    const e = Math.min(1, dt * 8);
    view.yaw += (view.tYaw - view.yaw) * e; view.pitch += (view.tPitch - view.pitch) * e; view.dist += (view.tDist - view.dist) * e;
    camPos(tmpV, P.x, P.z); tmpV.y = Math.max(tmpV.y, heightAt(tmpV.x, tmpV.z) + 1.5); // 언덕 속으로 들어가지 않게
    cam.position.lerp(tmpV, Math.min(1, dt * 6)); lookAt.lerp(tmpV.set(P.x, ground + 1.4, P.z), Math.min(1, dt * 6));
  }
  cam.lookAt(lookAt);

  // 해(그림자)는 내 양을 따라다닌다
  land.sun.target.position.set(P.x, ground, P.z); land.sun.position.copy(land.sun.target.position).add(land.sunOff);
  // 수출선: $10,000마다 뱃고동을 울리며 떠났다가 새 배가 들어온다
  if (shipT >= 0) {
    shipT += dt; const sp = land.ship.position;
    if (shipT < 26) { const k = shipT / 26; sp.set(SHIP0.x + k * k * 30, SHIP0.y, SHIP0.z - k * k * 150); land.ship.rotation.y = -Math.min(1, k * 3) * 1.3; }
    else if (shipT < 44) { const k = 1 - (shipT - 26) / 18; sp.set(SHIP0.x + k * k * 170, SHIP0.y, SHIP0.z - k * 12); land.ship.rotation.y = 0; }
    else { sp.copy(SHIP0); shipT = -1; }
  }
  land.ship.position.y = SHIP0.y + Math.sin(t * 1.3) * 0.08;
  dog.update(dt, t); land.update(t);
  uiT -= dt; if (uiT <= 0) { uiT = 0.2; updateUi(wool, raw.len); }
  shear.update(dt); sky.update(dt, t); updateHud(dt, cam);
  r.render(scene, cam);
  requestAnimationFrame(loop);
}
// ── 작은 지도, 길 안내 화살표, 처음 안내 (0.2초마다)
const mapView = () => ({
  me: { x: me.root.position.x, z: me.root.position.z, ry: me.root.rotation.y },
  others: [...others.values()].map((o) => ({ x: o.root.position.x, z: o.root.position.z, friend: o.friend })),
  npcs: land.npcs, dog: herding && dog.on ? { x: dog.group.position.x, z: dog.group.position.z } : null, built: gstate.built,
});
const miniC = $('miniC') as HTMLCanvasElement, bigMap = $('bigMap') as HTMLCanvasElement;
function updateUi(wool: number, moving: number) {
  const P = me.root.position;
  drawFarm(miniC, mapView()); if (!$('mapPanel').hidden) drawFarm(bigMap, mapView(), true);
  // 털이 무거운데 헛간이 멀면 방향과 거리를 알려 준다 (양몰이 중엔 마당 방향)
  const tx = herding ? GATHER.x : ZONE.x, tz = herding ? GATHER.z : ZONE.z, dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
  const show = mode === 'walk' && d > 18 && (herding || wool >= 0.6);
  $('guide').hidden = !show;
  if (show) {
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), sx = dx * cy - dz * sy, sz = dx * sy + dz * cy;
    $('guideArrow').style.transform = `rotate(${Math.atan2(sx, -sz)}rad)`; $('guideText').textContent = `${herding ? 'Yard' : 'Woolshed'} ${Math.round(d)} m`;
  }
  // 처음 온 양을 위한 세 걸음 안내
  let hint = '';
  if (store.tut < 3 && joined && !herding) {
    if (mode === 'shear') hint = 'Swipe across your wool to shear it.';
    else if (mode === 'queue') hint = 'Wait your turn. The farmer shears one sheep at a time.';
    else if (store.tut < 2) hint = stage === 4 ? 'So much wool you can only roll! Push the stick and roll to the green ring.' : 'Walk to the green ring by the red woolshed for a haircut.';
    else { tutT += 0.2; hint = 'Light as a feather! Graze, rest, and explore. Tap the little map to see the farm.'; if (tutT > 12 || (moving > 0.5 && tutT > 5)) { store.tut = 3; save(); } }
  }
  $('hint').hidden = !hint; if (hint) $('hint').textContent = hint;
}
function renderMapPanel() {
  drawFarm(bigMap, mapView(), true);
  $('mapLegend').textContent = "Blue arrow: you. White dots: other sheep. Pink: friends. Yellow: the farm's own sheep. The sea is north.";
  renderVote($('fundText'), $('voteList'), gstate, voted, (id) => socket.emit('vote', id, (res: VoteResult) => {
    if (res.ok || res.why === 'already') { voted = true; store.voteDay = today(); save(); }
    toast(res.ok ? 'Vote counted. Sweet as!' : res.why === 'already' ? "You've already voted today." : 'Voting is closed right now.', 3); track('vote', { id, ok: res.ok }); renderMapPanel();
  }));
  renderNz($('nzMap'), gstate.built, farm, (id) => { track('farm_travel', { to: id }); goFarm(id); });
}
$('mini').addEventListener('click', () => { $('mapPanel').hidden = false; renderMapPanel(); track('map_opened'); });
$('mapClose').addEventListener('click', () => { $('mapPanel').hidden = true; });
$('mapPanel').addEventListener('click', (e) => { if (e.target === $('mapPanel')) $('mapPanel').hidden = true; });

// ── 친구 초대: 같은 코드를 가진 양끼리 같은 농장에서 만나고 하트가 보인다
$('invite').addEventListener('click', async () => {
  if (!store.party) { store.party = Math.random().toString(36).slice(2, 8).padEnd(6, 'a'); save(); socket.emit('join', { uid, acc: store.wearing, farm, party: store.party }); }
  const url = `${location.origin}/?f=${store.party}`, text = "Come be a sheep with me in New Zealand. She'll be right.";
  track('invite');
  try { if (navigator.share) { await navigator.share({ title: "Sheep'll Be Right", text, url }); return; } } catch (e) { if ((e as DOMException)?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied. Send it to a friend!', 3); } catch { toast(url, 8); }
});

// ── 내 기록과 옷장 (이 브라우저에만 저장)
const known = new Set(ITEMS.filter((i) => i.unlocked(store)).map((i) => i.id));
function checkUnlocks() {
  for (const it of ITEMS) if (!known.has(it.id) && it.unlocked(store)) { known.add(it.id); toast(`New in your wardrobe: ${it.name}! Tap the sheep button to wear it.`, 4); track('unlock', { item: it.id }); }
}
function renderMe() {
  const stats: [string, string][] = [
    ['Times shorn', String(store.shears)], ['Clean blows', String(store.cleanBlows)],
    ['Wool given', `${store.kg.toLocaleString('en-NZ')} kg`], ['Milk given', `${store.litres.toLocaleString('en-NZ')} L`],
    ['Added to exports', `NZ$ ${store.earned.toLocaleString('en-NZ')}`], ['Days on the farm', String(store.days.length)],
  ];
  $('meStats').replaceChildren(...stats.map(([k, v]) => { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); return d; }));
  $('wardrobe').replaceChildren(...[{ id: '', name: 'Nothing', how: 'Just wool', unlocked: () => true }, ...ITEMS].map((it) => {
    const b = document.createElement('button'), open = it.unlocked(store), name = document.createElement('span'), how = document.createElement('small');
    name.textContent = it.name; how.textContent = open ? (store.wearing === it.id ? 'Wearing' : 'Tap to wear') : it.how;
    b.append(name, how); b.disabled = !open; b.setAttribute('aria-pressed', String(store.wearing === it.id));
    b.addEventListener('click', () => { store.wearing = it.id; save(); wear(me.sheep, it.id); socket.emit('wear', it.id); track('wear', { item: it.id || 'none' }); renderMe(); });
    return b;
  }));
}
$('meBtn').addEventListener('click', () => { renderMe(); $('mePanel').hidden = false; track('me_opened'); });
$('meClose').addEventListener('click', () => { $('mePanel').hidden = true; });
$('mePanel').addEventListener('click', (e) => { if (e.target === $('mePanel')) $('mePanel').hidden = true; });

// ── 사진: 버튼은 숨기고 장면만
const LINES = ['Living my best sheep life.', "She'll be right.", 'Just a sheep, no worries.', 'Fresh off the farm.'];
$('photoBtn').addEventListener('click', async () => {
  document.body.classList.add('shot');
  const shot = grab(canvas, () => r.render(scene, cam));
  document.body.classList.remove('shot');
  const line = stage === 0 ? 'Fresh cut, feeling light.' : stage === 4 ? 'Too much wool. Rolling now.' : LINES[Math.floor(Math.random() * LINES.length)];
  const blob = await compose(shot, line); if (!blob) return;
  const how = await share(blob); track('photo', { how, stage });
});

loop();

if (location.search.includes('debug')) (window as any).__dbg = { r, store, me, land, dog, heightAt, get state() { return gstate; }, get pose() { return pose; }, get herding() { return herding; }, others, cam, puffs: me.sheep.userData.puffs, get mode() { return mode; }, get queue() { return queue; }, get stage() { return stage; }, ZONE, MILK };
