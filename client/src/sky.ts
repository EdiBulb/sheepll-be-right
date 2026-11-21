import * as THREE from 'three';

// 하늘의 작은 움직임 (항상 낮인 하늘이 심심하지 않게)
// - 구름: 바람 방향으로 천천히 흘러가고, 끝까지 가면 반대편에서 다시 들어온다
// - 새 떼: 가끔 V자로 목장 위를 가로질러 날아간다 (날갯짓)

export function createSky(scene: THREE.Scene, clouds: THREE.Object3D[]) {
  const speeds = clouds.map(() => 0.6 + Math.random() * 0.8);
  clouds.forEach((c) => { c.userData.dynamic = true; });

  const birdM = new THREE.MeshBasicMaterial({ color: 0x2f3a4c, side: THREE.DoubleSide, fog: false });
  const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.9, 0.15, 0.35), new THREE.Vector3(0, 0, 0.5)]);
  wingGeo.setIndex([0, 1, 2]); wingGeo.computeVertexNormals();
  const flock = new THREE.Group(); flock.visible = false; flock.userData.dynamic = true; scene.add(flock);
  const birds: { l: THREE.Mesh; r: THREE.Mesh; ph: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(), row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    b.position.set(side * row * 1.6, Math.random() * 0.4, row * 1.4);
    const l = new THREE.Mesh(wingGeo, birdM), r = new THREE.Mesh(wingGeo, birdM); r.scale.x = -1;
    b.add(l, r); flock.add(b); birds.push({ l, r, ph: Math.random() * 6 });
  }
  let flyT = -1, next = 8 + Math.random() * 10;
  const from = new THREE.Vector3(), to = new THREE.Vector3();

  return {
    update(dt: number, t: number) {
      clouds.forEach((c, i) => { c.position.x += speeds[i] * dt; if (c.position.x > 70) c.position.x = -70; });
      if (flyT < 0) {
        next -= dt;
        if (next <= 0) {
          const a = Math.random() * Math.PI * 2, y = 14 + Math.random() * 6;
          from.set(Math.cos(a) * 60, y, Math.sin(a) * 60); to.set(-from.x, y + 2, -from.z);
          flock.position.copy(from); flock.lookAt(to); flock.visible = true; flyT = 0;
        }
        return;
      }
      flyT += dt / 16; flock.position.lerpVectors(from, to, flyT);
      for (const b of birds) { const w = Math.sin(t * 9 + b.ph) * 0.7; b.l.rotation.z = w; b.r.rotation.z = -w; }
      if (flyT >= 1) { flyT = -1; flock.visible = false; next = 20 + Math.random() * 25; }
    },
  };
}
