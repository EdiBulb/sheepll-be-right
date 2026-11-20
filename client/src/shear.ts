import * as THREE from 'three';

// 털 깎기 미니게임: 양이 앉으면 손가락(마우스)으로 털을 쓸어서 깎는다.
// 깎인 털은 옆 더미로 날아가 쌓이고, 끝나면 둥글게 말려 수출용 베일로 던져진다.

type Flake = { m: THREE.Object3D; t: number; T?: number; from?: THREE.Vector3; to?: THREE.Vector3; v?: THREE.Vector3 };

export function createShear(o: {
  scene: THREE.Scene; cam: THREE.Camera; canvas: HTMLCanvasElement; sheep: THREE.Group;
  zone: THREE.Vector3; solids: { x: number; z: number; r: number }[];
  onFinish: (clean: boolean) => void;
}) {
  const { scene, cam, canvas, sheep } = o;
  const { puffs, woolCore, skinCore, body } = sheep.userData as { puffs: THREE.Mesh[]; woolCore: THREE.Mesh; skinCore: THREE.Mesh; body: THREE.Group };
  const woolM = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 1 });
  const flakeGeo = new THREE.SphereGeometry(0.2, 10, 8);

  // 양털 더미
  const PILE = new THREE.Vector3(o.zone.x + 1.7, 0, o.zone.z + 0.4);
  const pile = new THREE.Group(); pile.position.copy(PILE); scene.add(pile);
  [[0, 0.25, 0, 0.5], [0.35, 0.2, 0.15, 0.38], [-0.3, 0.2, -0.1, 0.4], [0.05, 0.45, 0.05, 0.35]].forEach(([x, y, z, r]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), woolM); m.position.set(x, y, z); m.castShadow = true; pile.add(m);
  });
  pile.scale.setScalar(0.001);
  let pileTarget = 0;

  // 수출용 양털 베일
  const BALE = new THREE.Vector3(o.zone.x + 2.2, 0, o.zone.z - 2.0);
  const bale = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0xc8a978, roughness: 1 }));
  bale.position.set(BALE.x, 0.55, BALE.z); bale.castShadow = true; scene.add(bale);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.02), new THREE.MeshBasicMaterial({ color: 0x24324a }));
  tag.position.set(BALE.x, 0.7, BALE.z + 0.56); scene.add(tag);
  o.solids.push({ x: BALE.x, z: BALE.z, r: 0.7 });
  let balePop = 0;

  // 털 깎는 기계(핸드피스)
  const clipper = new THREE.Group(); clipper.visible = false; scene.add(clipper);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.35 });
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3b3f46 }));
  handle.rotation.x = Math.PI / 2; handle.position.z = 0.35; clipper.add(handle);
  clipper.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.16), metal));
  for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.12), metal); t.position.set(-0.15 + i * 0.05, 0, -0.12); clipper.add(t); }

  const flakes: Flake[] = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), wp = new THREE.Vector3();
  let state: 'off' | 'shear' | 'finish' = 'off';
  let woolScale = 1, dragging = false, strokeHit = false, strokes = 0, removed = 0, finishT = 0, buzz = 0;
  let front: Set<THREE.Mesh> | null = null;

  const flyToPile = (from: THREE.Vector3, T = 0.6) => {
    const m = new THREE.Mesh(flakeGeo, woolM); m.position.copy(from); scene.add(m);
    flakes.push({ m, from: from.clone(), to: PILE.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6)), t: T, T });
  };

  function shave(e: PointerEvent) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    if (!front) { // 카메라 쪽 털만 목표로 센다. 뒤쪽 털은 마지막에 한꺼번에 떨어진다
      const c = new THREE.Vector3(); body.getWorldPosition(c); const toCam = cam.position.clone().sub(c);
      front = new Set(puffs.filter((p) => p.getWorldPosition(wp).sub(c).dot(toCam) > 0));
    }
    const vis = puffs.filter((p) => p.visible);
    const hit = ray.intersectObjects(vis, false)[0] || ray.intersectObject(skinCore, false)[0];
    if (!hit) { clipper.visible = false; return; }
    clipper.visible = true; clipper.position.copy(hit.point).addScaledVector(ray.ray.direction, -0.15);
    clipper.lookAt(cam.position); clipper.rotateX(-Math.PI / 2.4);
    for (const p of vis) {
      p.getWorldPosition(wp);
      const pr = ((p.geometry as THREE.SphereGeometry).parameters.radius || 0.3) * woolScale * p.scale.x;
      if (p === hit.object || wp.distanceTo(hit.point) - pr < 0.16 * woolScale) {
        p.visible = false; if (front.has(p)) removed++; strokeHit = true; buzz = 0.12; flyToPile(wp);
      }
    }
    if (removed / Math.max(1, front.size) > 0.75) finish();
  }
  canvas.addEventListener('pointerdown', (e) => { if (state !== 'shear') return; dragging = true; strokeHit = false; shave(e); });
  canvas.addEventListener('pointermove', (e) => { if (state === 'shear' && dragging) shave(e); });
  addEventListener('pointerup', () => { if (state === 'shear' && dragging && strokeHit) strokes++; dragging = false; clipper.visible = false; });

  function finish() {
    if (strokeHit) strokes++;
    state = 'finish'; finishT = 0; dragging = false; clipper.visible = false;
    for (const p of puffs) if (p.visible) { p.visible = false; flyToPile(p.getWorldPosition(wp), 0.5); }
  }
  function restore() { puffs.forEach((p) => (p.visible = true)); woolCore.visible = true; skinCore.visible = false; sheep.position.x = 0; clipper.visible = false; }

  return {
    get state() { return state; },
    enter(wool: number) {
      state = 'shear'; woolScale = 0.62 + wool * 0.88; removed = 0; strokes = 0; pileTarget = 0; front = null; dragging = false;
      woolCore.visible = false; skinCore.visible = true;
    },
    /** 줄에서 밀려났을 때 등, 보상 없이 원래대로 */
    cancel() { if (state === 'off') return; state = 'off'; restore(); pileTarget = 0; },
    /** 다른 양이 털 깎였을 때의 털 날림 */
    burst(at: THREE.Vector3) {
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(flakeGeo, woolM); m.position.copy(at).add(new THREE.Vector3(0, 1.2, 0)); scene.add(m);
        flakes.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5), t: 1.2 });
      }
    },
    update(dt: number) {
      if (state === 'shear' || state === 'finish') { // 깎는 동안 살짝 떨림
        buzz = Math.max(0, buzz - dt); sheep.position.x = buzz > 0 ? (Math.random() - 0.5) * 0.03 : 0;
      }
      if (state === 'finish') {
        finishT += dt;
        if (finishT > 0.7 && finishT - dt <= 0.7) { // 더미를 말아서 베일로 던진다
          const m = pile.clone(); scene.add(m); pile.scale.setScalar(0.001); pileTarget = 0;
          flakes.push({ m, from: PILE.clone(), to: BALE.clone().add(new THREE.Vector3(0, 1, 0)), t: 0.8, T: 0.8 });
        }
        if (finishT > 1.6) { state = 'off'; restore(); balePop = 0.2; o.onFinish(strokes <= 6); }
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]; f.t -= dt;
        if (f.to) { const k = 1 - Math.max(0, f.t) / f.T!; f.m.position.lerpVectors(f.from!, f.to, k); f.m.position.y += Math.sin(k * Math.PI) * 1.2; }
        else { f.v!.y -= 9 * dt; f.m.position.addScaledVector(f.v!, dt); f.m.scale.setScalar(Math.max(0.01, f.t)); }
        if (f.t <= 0) { scene.remove(f.m); flakes.splice(i, 1); if (f.to && state === 'shear') pileTarget = Math.min(1.4, pileTarget + 0.035); }
      }
      pile.scale.setScalar(pile.scale.x + (Math.max(0.001, pileTarget) - pile.scale.x) * Math.min(1, dt * 8));
      balePop = Math.max(0, balePop - dt); bale.scale.y = 1 + balePop * 1.2;
    },
  };
}
