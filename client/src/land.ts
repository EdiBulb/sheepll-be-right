import * as THREE from 'three';
import { SHORE_Z, WORLD_R } from '../../server/src/shared';
import { MOODS } from './moods.js';
import { makeSheep, setWool } from './sheepkit.js';

// 넓은 목장: 반지름 78m. 가운데 헛간 마당, 그 둘레로 언덕·숲·연못·꽃밭·전망대·항구.
// 북쪽(-z)이 바다. heightAt()은 땅 모양의 유일한 기준이라 양의 높이·구르기·나무 배치가 모두 이걸 쓴다.

export const PLACES = {
  yard: { x: 0, z: 0, name: 'Woolshed' },
  milk: { x: 26, z: 6, name: 'Milking shed' },
  pond: { x: -28, z: 26, name: 'Pond' },
  flowers: { x: 34, z: 38, name: 'Meadow' },
  forest: { x: -52, z: -4, name: 'Bush' },
  lookout: { x: -36, z: -34, name: 'Lookout' },
  port: { x: 14, z: -56, name: 'Port' },
};

const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export function heightAt(x: number, z: number) {
  let h = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05) * 2.6 + Math.sin(x * 0.11 + z * 0.07) * 0.9 + Math.cos(x * 0.02 - z * 0.03) * 1.5 + 2.4;
  const ld = Math.hypot(x - PLACES.lookout.x, z - PLACES.lookout.z); h += 10 * Math.exp(-(ld * ld) / (2 * 13 * 13)); // 전망대 언덕
  const flat = (cx: number, cz: number, r0: number, r1: number, level: number) => { const k = 1 - sm(r0, r1, Math.hypot(x - cx, z - cz)); h += (level - h) * k; };
  flat(0, 0, 15, 30, 0);                               // 헛간 마당은 평평하게
  flat(PLACES.milk.x, PLACES.milk.z, 4, 10, 0.6);
  flat(PLACES.pond.x, PLACES.pond.z, 7, 15, 0.6);
  const pd = Math.hypot(x - PLACES.pond.x, z - PLACES.pond.z); if (pd < 6) h -= 1 - sm(0, 6, pd); // 연못 바닥
  flat(PLACES.port.x, PLACES.port.z, 7, 14, 0.5);
  h += (-2 - h) * sm(-58, -72, z);                     // 북쪽은 바다로 내려간다
  return h;
}

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** 농장(도시)마다 다른 빛과 색 */
const FARM_MOOD: Record<string, any> = {
  auckland: MOODS.sunny,
  hamilton: MOODS.golden,
  tauranga: { ...MOODS.sunny, sky: 0xc8ecff, skyTop: 0x58b4ff, grass: 0xa8e08a, sun: [0xfff0d0, 2.7] },
  wellington: { ...MOODS.overcast, fog: null },
  christchurch: MOODS.canterbury,
  queenstown: { ...MOODS.canterbury, sky: 0xcfe3f2, skyTop: 0x6fa3d8, grass: 0x8fb574, leaf: 0x4a7f52 },
};

export interface Solid { x: number; z: number; r: number }

export function buildLand(scene: THREE.Scene, farm: string) {
  const o = FARM_MOOD[farm] || MOODS.sunny;
  const solids: Solid[] = [];
  const rand = rng(farm.length * 977 + 13);
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const M = (color: number) => { let m = mats.get(color); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); mats.set(color, m); } return m; };
  const S = (r: number, s = 14) => new THREE.SphereGeometry(r, s, Math.round(s * 0.75));
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  /** 땅 위 (x,z)에 놓인 그룹 */
  const at = (x: number, z: number, ry = 0, s = 1) => { const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = ry; g.scale.setScalar(s); scene.add(g); return g; };

  // ── 하늘·안개·빛
  scene.background = new THREE.Color(o.sky);
  scene.fog = new THREE.Fog(o.fog?.[0] ?? o.sky, 70, 210);
  scene.add(new THREE.HemisphereLight(o.hemi[0], o.hemi[1], o.hemi[2]));
  const sun = new THREE.DirectionalLight(o.sun[0], o.sun[1]);
  const sunOff = new THREE.Vector3(...(o.sunPos as [number, number, number])).multiplyScalar(2);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 4; sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, far: 160 });
  scene.add(sun, sun.target); sun.userData.dynamic = true;
  {
    const g = new THREE.SphereGeometry(300, 32, 16), c = new THREE.Color(), top = new THREE.Color(o.skyTop ?? o.sky), bot = new THREE.Color(o.sky), cols: number[] = [], p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = Math.max(0, p.getY(i) / 300); c.copy(bot).lerp(top, Math.pow(t, 0.6)); cols.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  }

  // ── 땅: 높이에 따라 풀 색이 조금씩 다르고, 물가는 모래색
  {
    const g = new THREE.PlaneGeometry(260, 260, 130, 130); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols: number[] = [], grass = new THREE.Color(o.grass), hi = grass.clone().offsetHSL(0.02, -0.05, 0.06), lo = grass.clone().offsetHSL(-0.01, 0.03, -0.05), sand = new THREE.Color(0xeadfb8), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, h);
      c.copy(lo).lerp(hi, sm(0, 9, h + Math.sin(x * 0.3) * 0.6)); if (h < 0.45) c.lerp(sand, 1 - sm(-0.3, 0.45, h));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); ground.receiveShadow = true; scene.add(ground);
  }
  // 바다와 먼 언덕
  const seaM = new THREE.MeshStandardMaterial({ color: 0x3fa7d6, roughness: 0.3 });
  { const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 320), seaM); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.5, -200); scene.add(sea); }
  [[-150, 60, 60], [150, 40, 70], [-60, 170, 80], [90, 165, 70], [-170, -40, 50], [175, -30, 45]].forEach(([x, z, r]) => add(scene, S(r, 24), M(new THREE.Color(o.grass).offsetHSL(0, -0.08, -0.04).getHex()), x, -r * 0.55, z, 1, 0.75, 1));
  if (o.mountains) [[-110, 150, 55], [-40, 175, 70], [40, 170, 62], [120, 150, 50], [-175, 60, 45]].forEach(([x, z, h]) => {
    add(scene, new THREE.ConeGeometry(h * 0.9, h, 20), M(o.mountain), x, h / 2 - 4, z).castShadow = false;
    add(scene, new THREE.ConeGeometry(h * 0.33, h * 0.37, 20), M(0xffffff), x, h - h * 0.18 - 4, z).castShadow = false;
  });

  // ── 구름
  const clouds: THREE.Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group(); c.position.set(-110 + rand() * 220, 30 + rand() * 16, -100 + rand() * 200); c.scale.setScalar(1.2 + rand()); scene.add(c); clouds.push(c);
    [[0, 0, 0, 3], [3, -0.5, 0, 2.4], [-3, -0.6, 0, 2.2], [1.4, 1.4, 0, 2.2]].forEach(([a, b, d, r]) => { const m = new THREE.Mesh(S(r, 12), new THREE.MeshStandardMaterial({ color: o.cloud ?? 0xffffff, emissive: o.cloud ?? 0xffffff, emissiveIntensity: 0.35, fog: false })); m.position.set(a, b, d); c.add(m); });
  }

  // ── 나무와 바위
  const tree = (x: number, z: number, s: number, pine: boolean) => {
    const g = at(x, z, rand() * 6, s);
    add(g, new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8), M(0x8a5a3a), 0, 0.8, 0);
    if (pine) { add(g, new THREE.ConeGeometry(1.2, 2.4, 10), M(o.leaf), 0, 2.4, 0); add(g, new THREE.ConeGeometry(0.9, 1.8, 10), M(o.leaf), 0, 3.4, 0); }
    else { add(g, S(1.3), M(o.leaf), 0, 2.6, 0); add(g, S(0.9), M(o.leaf), 0.8, 2.2, 0.3); add(g, S(0.8), M(o.leaf), -0.7, 2.3, -0.2); }
    solids.push({ x, z, r: 0.55 * s });
  };
  const clear = (x: number, z: number) => Math.hypot(x, z) > 20 && Math.hypot(x, z) < WORLD_R + 6 && z > SHORE_Z + 6
    && Object.values(PLACES).every((p) => p === PLACES.forest || Math.hypot(x - p.x, z - p.z) > 11);
  for (let i = 0; i < 46; i++) { // 숲
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 17, x = PLACES.forest.x + Math.cos(a) * d, z = PLACES.forest.z + Math.sin(a) * d;
    if (Math.hypot(x, z) < WORLD_R + 4) tree(x, z, 1 + rand() * 0.8, o.pine || rand() < 0.4);
  }
  for (let i = 0; i < 60; i++) { const x = -84 + rand() * 168, z = -60 + rand() * 144; if (clear(x, z)) tree(x, z, 0.9 + rand() * 0.6, !!o.pine); }
  for (let i = 0; i < 26; i++) { const x = -80 + rand() * 160, z = -58 + rand() * 138; if (!clear(x, z)) continue; const r = 0.5 + rand() * 0.9; add(at(x, z, rand() * 6), S(r, 7), M(0xa8a39a), 0, r * 0.3, 0, 1.2, 0.7, 1); solids.push({ x, z, r: r * 0.9 }); }

  // ── 헛간 마당: 빨간 털 깎는 헛간, 농부, 울타리
  {
    const shed = at(-5, -6, 0.5);
    add(shed, new THREE.BoxGeometry(4.4, 2.4, 3.2), M(0xf3ead8), 0, 1.2, 0);
    add(shed, new THREE.CylinderGeometry(0.01, 2.9, 1.6, 4, 1), M(0xc9453a), 0, 3.2, 0, 1.15, 1, 0.85).rotation.y = Math.PI / 4;
    add(shed, new THREE.BoxGeometry(1.2, 1.7, 0.1), M(0x6b4a35), 0.6, 0.85, 1.62);
    solids.push({ x: -5, z: -6, r: 2.6 });
    person(-2.4, -3.6, 0.9, 0x3f6fa8, 'hat');
    for (let i = -7; i <= 7; i++) {
      const a = i * 0.13 + Math.PI * 0.5, R = 13, x = Math.cos(a) * R, z = Math.sin(a) * R;
      add(scene, new THREE.BoxGeometry(0.18, 1.1, 0.18), M(0xc9a27a), x, 0.55, z);
      if (i < 7) { const a2 = (i + 1) * 0.13 + Math.PI * 0.5, x2 = Math.cos(a2) * R, z2 = Math.sin(a2) * R; [0.45, 0.85].forEach((y) => { add(scene, new THREE.BoxGeometry(Math.hypot(x2 - x, z2 - z), 0.1, 0.08), M(0xc9a27a), (x + x2) / 2, y, (z + z2) / 2).rotation.y = -Math.atan2(z2 - z, x2 - x); }); }
    }
  }
  function person(x: number, z: number, ry: number, shirt: number, head: 'hat' | 'cap') {
    const g = at(x, z, ry);
    add(g, new THREE.CapsuleGeometry(0.45, 0.8, 6, 12), M(shirt), 0, 1.05, 0); add(g, S(0.38), M(0xf2c9a8), 0, 2.05, 0);
    if (head === 'hat') { add(g, new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16), M(0x8a6a3a), 0, 2.32, 0); add(g, new THREE.CylinderGeometry(0.34, 0.38, 0.35, 14), M(0x8a6a3a), 0, 2.5, 0); }
    else add(g, new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd8433b), 0, 2.12, 0);
    [-0.18, 0.18].forEach((lx) => add(g, new THREE.CapsuleGeometry(0.15, 0.5, 4, 8), M(0x3b3b46), lx, 0.35, 0));
    solids.push({ x, z, r: 0.6 }); return g;
  }

  // ── 우유 헛간 (파란 지붕)
  {
    const p = PLACES.milk, shed = at(p.x + 4, p.z - 4, -0.6);
    add(shed, new THREE.BoxGeometry(3.6, 2.1, 2.8), M(0xf3ead8), 0, 1.05, 0);
    add(shed, new THREE.CylinderGeometry(0.01, 2.5, 1.4, 4, 1), M(0x3f7fb8), 0, 2.8, 0, 1.1, 1, 0.85).rotation.y = Math.PI / 4;
    solids.push({ x: p.x + 4, z: p.z - 4, r: 2.3 });
    const g = person(p.x + 1.6, p.z - 1.2, -0.8, 0xffffff, 'cap');
    add(g, new THREE.CylinderGeometry(0.32, 0.26, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.6, roughness: 0.3 }), 0.9, 0.25, 0.6);
  }

  // ── 연못과 개울
  {
    const p = PLACES.pond, water = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), seaM); water.rotation.x = -Math.PI / 2; water.position.set(p.x, 0.36, p.z); water.receiveShadow = true; scene.add(water);
    for (let i = 0; i < 12; i++) { const a = rand() * 6.28, d = 4.3 + rand(), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; add(at(x, z), new THREE.CylinderGeometry(0.03, 0.05, 1.2 + rand() * 0.6, 5), M(0x6fa05a), 0, 0.6, 0); }
    // 개울: 전망대 언덕 기슭에서 연못까지 땅을 따라 흐르는 띠
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 26; i++) { const t = i / 26, x = -40 + (p.x + 40) * t + Math.sin(t * 9) * 3, z = -8 + (p.z + 8) * t; pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.07, z)); }
    const pos: number[] = [], idx: number[] = [];
    pts.forEach((q, i) => { const n = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).setY(0).normalize(), sx = -n.z * 0.7, sz = n.x * 0.7; pos.push(q.x + sx, q.y, q.z + sz, q.x - sx, q.y, q.z - sz); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, seaM));
  }

  // ── 꽃밭 (작은 꽃 수백 송이를 한 번에 그림)
  {
    const p = PLACES.flowers, geo = S(0.16, 6), dummy = new THREE.Object3D();
    [0xff8fb3, 0xffd23f, 0xb28dff, 0xffffff].forEach((col) => {
      const im = new THREE.InstancedMesh(geo, M(col), 110);
      for (let i = 0; i < 110; i++) { const a = rand() * 6.28, d = Math.sqrt(rand()) * 13, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; dummy.position.set(x, heightAt(x, z) + 0.22, z); dummy.scale.setScalar(0.8 + rand() * 0.7); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
      im.userData.dynamic = true; scene.add(im);
    });
  }

  // ── 전망대: 언덕 꼭대기 벤치와 깃발
  {
    const p = PLACES.lookout, g = at(p.x, p.z, 0.3);
    add(g, new THREE.BoxGeometry(2.2, 0.12, 0.6), M(0xc9a27a), 0, 0.55, 1.2); [-0.9, 0.9].forEach((x) => add(g, new THREE.BoxGeometry(0.12, 0.55, 0.5), M(0x8a5a3a), x, 0.27, 1.2));
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 4, 6), M(0xf3ead8), -1.8, 2, -0.5); add(g, new THREE.BoxGeometry(1.1, 0.7, 0.04), M(0xd8433b), -1.22, 3.6, -0.5);
    solids.push({ x: p.x - 1.7, z: p.z - 1, r: 0.3 });
  }

  // ── 항구: 부두, 창고, 양털 꾸러미, 수출선
  const ship = new THREE.Group(); ship.userData.dynamic = true;
  {
    const p = PLACES.port;
    add(scene, new THREE.BoxGeometry(4, 0.5, 20), M(0x9b7b5b), p.x, 0.15, -70);
    for (let i = 0; i < 5; i++) [-1.8, 1.8].forEach((x) => add(scene, new THREE.CylinderGeometry(0.2, 0.2, 2.4, 6), M(0x6b4a35), p.x + x, -0.6, -62 - i * 4.4));
    const wh = at(p.x - 8, p.z - 1, 0.2); add(wh, new THREE.BoxGeometry(5, 2.6, 3.4), M(0xdfe6ea), 0, 1.3, 0); add(wh, new THREE.BoxGeometry(5.3, 0.3, 3.8), M(0x3f6fa8), 0, 2.75, 0); solids.push({ x: p.x - 8, z: p.z - 1, r: 3 });
    for (let i = 0; i < 6; i++) { const x = p.x + 3 + (i % 3) * 1.3, z = p.z + 2 + Math.floor(i / 3) * 1.3; add(at(x, z), new THREE.BoxGeometry(1.1, 1.1, 1.1), M(0xc8a978), 0, 0.55, 0); }
    solids.push({ x: p.x + 4.3, z: p.z + 2.6, r: 2 });
    add(ship, new THREE.BoxGeometry(11, 2, 3.4), M(0xd8433b), 0, 0.6, 0); add(ship, new THREE.BoxGeometry(11.3, 0.3, 3.6), M(0xffffff), 0, 1.7, 0);
    add(ship, new THREE.BoxGeometry(2.6, 1.8, 2.4), M(0xffffff), 3.4, 2.7, 0); add(ship, new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), M(0x2f4f7a), 3.4, 4.3, 0);
    [-3.6, -1.9, -0.2].forEach((x) => add(ship, new THREE.BoxGeometry(1.4, 1.1, 2.2), M(0xf3ead8), x, 2.4, 0));
    ship.position.set(p.x + 8, -0.4, -70); scene.add(ship);
  }

  // ── 원래 이 목장에 사는 NPC 양 (귀에 노란 태그, 접속자 수에는 안 셈)
  const lite = { legLen: 0.24, ears: 'up', woolGlow: 0xeef6ff, puffN: 26, puffR: 0.52, jitter: 0, body: [1.12, 0.95, 1.05], tag: true };
  const npcs: Solid[] = [];
  [[7.5, -7, -0.4, 0.5], [-8.5, 3, 1.9, 0.7], [18, 14, -1.6, 0.9], [-22, 18, 2.4, 0.4], [30, 32, 0.3, 0.8], [-30, -26, 1.1, 0.6], [44, -8, 2.9, 0.75]].forEach(([x, z, ry, w]) => {
    const s = makeSheep(lite); setWool(s, w); s.position.set(x, heightAt(x, z), z); s.rotation.y = ry; scene.add(s);
    const so = { x, z, r: 1.0 + w * 0.5 }; solids.push(so); npcs.push(so);
  });

  // ── 투표로 지어지는 것들 (지어진 뒤에만 나타남)
  const done = new Set<string>();
  let mill: THREE.Object3D | null = null, lamp: THREE.Object3D | null = null;
  function addBuilding(id: string) {
    if (done.has(id)) return; done.add(id);
    const dyn = (g: THREE.Object3D) => { g.userData.dynamic = true; return g; };
    if (id === 'tree') {
      const g = dyn(at(11, 13)); add(g, new THREE.CylinderGeometry(0.6, 0.9, 4, 10), M(0x8a5a3a), 0, 2, 0);
      [[0, 6, 0, 3.6], [2.4, 5.2, 0.8, 2.4], [-2.2, 5.4, -0.6, 2.5], [0.4, 5, -2.2, 2.2], [-0.5, 5.1, 2.3, 2.2]].forEach(([x, y, z, r]) => add(g, S(r, 12), M(o.leaf), x, y, z));
      solids.push({ x: 11, z: 13, r: 1 });
    } else if (id === 'hay') {
      const g = dyn(at(-11, 10));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; add(g, new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12), M(0xe6c86a), Math.cos(a) * 3.2, 0.8, Math.sin(a) * 3.2).rotation.z = Math.PI / 2; solids.push({ x: -11 + Math.cos(a) * 3.2, z: 10 + Math.sin(a) * 3.2, r: 0.8 }); }
    } else if (id === 'lighthouse') {
      const g = dyn(at(34, -58)); add(g, new THREE.CylinderGeometry(1.1, 1.6, 8, 14), M(0xffffff), 0, 4, 0); add(g, new THREE.CylinderGeometry(1.35, 1.35, 1.2, 14), M(0xd8433b), 0, 3.2, 0);
      add(g, new THREE.CylinderGeometry(1.4, 1.4, 0.25, 14), M(0x3b3b46), 0, 8.1, 0); lamp = add(g, new THREE.CylinderGeometry(0.8, 0.8, 1.1, 10), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }), 0, 8.8, 0); add(g, new THREE.ConeGeometry(1.2, 1, 12), M(0xd8433b), 0, 9.9, 0);
      solids.push({ x: 34, z: -58, r: 1.8 });
    } else if (id === 'windmill') {
      const g = dyn(at(46, -12)); add(g, new THREE.CylinderGeometry(1.2, 2, 7, 10), M(0xf3ead8), 0, 3.5, 0); add(g, new THREE.ConeGeometry(1.6, 1.6, 10), M(0x8a5a3a), 0, 7.8, 0);
      mill = new THREE.Group(); mill.position.set(0, 6.4, 1.5); g.add(mill);
      for (let i = 0; i < 4; i++) { const b = add(mill, new THREE.BoxGeometry(0.7, 4.4, 0.08), M(0xffffff), 0, 0, 0); b.geometry = b.geometry.clone().translate(0, 2.4, 0); b.rotation.z = (i * Math.PI) / 2; }
      solids.push({ x: 46, z: -12, r: 2.2 });
    }
  }

  return {
    solids, npcs, clouds, ship, sun, sunOff, addBuilding,
    /** 풍차 날개와 등대 불빛 */
    update(t: number) { if (mill) mill.rotation.z = t * 0.5; if (lamp) (lamp as THREE.Mesh).scale.setScalar(1 + Math.sin(t * 2) * 0.06); },
  };
}
