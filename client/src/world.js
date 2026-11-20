import * as THREE from 'three';

// 분위기 시안용 장면 빌더 — opts 하나로 색·빛·재질·소품을 바꾼다
export function buildWorld(scene, o) {
  const solids = [];
  const toonGrad = (() => {
    const d = new Uint8Array([90, 170, 255]);
    const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
    t.needsUpdate = true; t.minFilter = t.magFilter = THREE.NearestFilter; return t;
  })();
  const M = (color, extra = {}) => {
    if (o.mat === 'toon') return new THREE.MeshToonMaterial({ color, gradientMap: toonGrad, ...extra });
    if (o.mat === 'flat') return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  };
  const seg = o.mat === 'flat' ? 7 : 28;
  const S = (r, s = seg) => new THREE.SphereGeometry(r, s, Math.max(5, Math.round(s * 0.75)));
  const add = (parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  // ── 하늘·안개·빛
  scene.background = o.bg === null ? null : new THREE.Color(o.sky);
  if (o.fog) scene.fog = new THREE.Fog(o.fog[0], o.fog[1], o.fog[2]);
  scene.add(new THREE.HemisphereLight(o.hemi[0], o.hemi[1], o.hemi[2]));
  const sun = new THREE.DirectionalLight(o.sun[0], o.sun[1]);
  sun.position.set(...o.sunPos); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 120 });
  scene.add(sun);

  // ── 하늘 그라데이션 돔
  if (o.skyTop) {
    const g = new THREE.SphereGeometry(200, 32, 16);
    const c = new THREE.Color(), top = new THREE.Color(o.skyTop), bot = new THREE.Color(o.sky);
    const cols = []; const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = Math.max(0, p.getY(i) / 200); c.copy(bot).lerp(top, Math.pow(t, 0.6)); cols.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  }

  // ── 땅 (디오라마면 떠 있는 섬)
  if (o.diorama) {
    const top = add(scene, new THREE.CylinderGeometry(16, 16, 0.6, 64), M(o.grass), 0, -0.3, 0);
    add(scene, new THREE.CylinderGeometry(16, 13, 4, 64), M(o.dirt || 0x9c7656), 0, -2.6, 0);
    top.receiveShadow = true;
  } else {
    const g = new THREE.PlaneGeometry(160, 160, 80, 80); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
      const h = d < 14 ? 0 : (Math.sin(x * 0.08) + Math.cos(z * 0.07)) * Math.min(1, (d - 14) / 12) * 1.6;
      p.setY(i, h);
    }
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, M(o.grass)); ground.receiveShadow = true; scene.add(ground);
  }

  // ── 먼 언덕
  if (!o.diorama) (o.hills || []).forEach(([x, z, r, col, sy]) => add(scene, S(r, 32), M(col), x, -r * (sy ?? 0.55) * 0.35, z, 1, sy ?? 0.55, 1));
  // ── 산 (캔터베리)
  if (o.mountains) [[-40, -70, 18], [-10, -80, 24], [25, -72, 20], [55, -66, 15]].forEach(([x, z, h]) => {
    add(scene, new THREE.ConeGeometry(h * 0.9, h, o.mat === 'flat' ? 6 : 24), M(o.mountain), x, h / 2 - 1, z);
    add(scene, new THREE.ConeGeometry(h * 0.33, h * 0.37, o.mat === 'flat' ? 6 : 24), M(0xffffff), x, h - h * 0.18 - 1, z);
  });
  // ── 바다·항구·수출선
  if (o.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), M(o.sea, { roughness: 0.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.05, -50); scene.add(sea);
    add(scene, new THREE.BoxGeometry(10, 0.5, 4), M(0x9b7b5b), 6, 0.3, -22);
    const ship = new THREE.Group(); ship.position.set(8, 0, -27); scene.add(ship);
    add(ship, new THREE.BoxGeometry(9, 1.6, 2.8), M(0xd8433b), 0, 0.8, 0);
    add(ship, new THREE.BoxGeometry(9.2, 0.3, 3), M(0xffffff), 0, 1.7, 0);
    add(ship, new THREE.BoxGeometry(2.4, 1.6, 2), M(0xffffff), 2.6, 2.6, 0);
    add(ship, new THREE.CylinderGeometry(0.4, 0.4, 1.4, 16), M(0x2f4f7a), 2.6, 4, 0);
    [-2.6, -1, 0.6].forEach((x) => add(ship, new THREE.BoxGeometry(1.3, 1, 2), M(0xf3ead8), x, 2.3, 0)); // 양털 짐
  }

  // ── 구름
  (o.clouds ?? [[-20, 22, -40], [18, 26, -50], [0, 30, -70], [35, 20, -30]]).forEach(([x, y, z]) => {
    const c = new THREE.Group(); c.position.set(x, y, z); scene.add(c);
    [[0, 0, 0, 3], [3, -0.5, 0, 2.4], [-3, -0.6, 0, 2.2], [1.4, 1.4, 0, 2.2]].forEach(([a, b, d, r]) => {
      const m = new THREE.Mesh(S(r, 18), M(o.cloud ?? 0xffffff, o.mat === 'standard' || !o.mat ? { emissive: o.cloud ?? 0xffffff, emissiveIntensity: 0.35 } : {}));
      m.position.set(a, b, d); c.add(m);
    });
  });

  // ── 나무
  const tree = (x, z, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    add(g, new THREE.CylinderGeometry(0.22, 0.3, 1.6, 10), M(o.trunk ?? 0x8a5a3a), 0, 0.8, 0);
    if (o.pine) { add(g, new THREE.ConeGeometry(1.2, 2.4, o.mat === 'flat' ? 6 : 16), M(o.leaf), 0, 2.4, 0); add(g, new THREE.ConeGeometry(0.9, 1.8, o.mat === 'flat' ? 6 : 16), M(o.leaf), 0, 3.4, 0); }
    else { add(g, S(1.3), M(o.leaf), 0, 2.6, 0); add(g, S(0.9), M(o.leaf), 0.8, 2.2, 0.3); add(g, S(0.8), M(o.leaf), -0.7, 2.3, -0.2); }
  };
  [[-9, -6, 1.2], [-12, 2, 1], [11, -9, 1.3], [13, 3, 0.9], [-6, -13, 1.1], [4, -15, 1]].forEach((t) => { tree(...t); solids.push({ x: t[0], z: t[1], r: 0.6 * t[2] }); });
  solids.push({ x: -5, z: -6, r: 2.6 }, { x: -2.4, z: -3.6, r: 0.6 });

  // ── 울타리
  const fenceM = M(o.fence ?? 0xc9a27a);
  for (let i = -6; i <= 6; i++) {
    const a = i * 0.13 + Math.PI * 0.5, R = 11.5;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    add(scene, new THREE.BoxGeometry(0.18, 1.1, 0.18), fenceM, x, 0.55, z);
    if (i < 6) {
      const a2 = (i + 1) * 0.13 + Math.PI * 0.5, x2 = Math.cos(a2) * R, z2 = Math.sin(a2) * R;
      [0.45, 0.85].forEach((y) => {
        const r = add(scene, new THREE.BoxGeometry(Math.hypot(x2 - x, z2 - z), 0.1, 0.08), fenceM, (x + x2) / 2, y, (z + z2) / 2);
        r.rotation.y = -Math.atan2(z2 - z, x2 - x);
      });
    }
  }

  // ── 빨간 털 깎는 헛간 (woolshed)
  const shed = new THREE.Group(); shed.position.set(-5, 0, -6); shed.rotation.y = 0.5; scene.add(shed);
  add(shed, new THREE.BoxGeometry(4.4, 2.4, 3.2), M(o.shedWall ?? 0xf3ead8), 0, 1.2, 0);
  const roof = add(shed, new THREE.CylinderGeometry(0.01, 2.9, 1.6, 4, 1), M(o.shedRoof ?? 0xc9453a), 0, 3.2, 0, 1.15, 1, 0.85);
  roof.rotation.y = Math.PI / 4;
  add(shed, new THREE.BoxGeometry(1.2, 1.7, 0.1), M(0x6b4a35), 0.6, 0.85, 1.62);

  // ── 농부 NPC
  const farmer = new THREE.Group(); farmer.position.set(-2.4, 0, -3.6); farmer.rotation.y = 0.9; scene.add(farmer);
  add(farmer, new THREE.CapsuleGeometry(0.45, 0.8, 8, 16), M(o.shirt ?? 0x3f6fa8), 0, 1.05, 0);
  add(farmer, S(0.38), M(0xf2c9a8), 0, 2.05, 0);
  add(farmer, new THREE.CylinderGeometry(0.7, 0.7, 0.06, 24), M(0x8a6a3a), 0, 2.32, 0);
  add(farmer, new THREE.CylinderGeometry(0.34, 0.38, 0.35, 20), M(0x8a6a3a), 0, 2.5, 0);
  [-0.18, 0.18].forEach((x) => add(farmer, new THREE.CapsuleGeometry(0.15, 0.5, 6, 10), M(0x3b3b46), x, 0.35, 0));

  // ── 양들
  const sheepAt = (x, z, ry, s = 1, lying = false, shorn = false) => {
    const sh = buildSheep(o, M, S, add, shorn); sh.position.set(x, lying ? -0.35 : 0, z); sh.rotation.y = ry; sh.scale.setScalar(s); scene.add(sh); solids.push({ x, z, r: 1.15 * s }); return sh;
  };
  if (!o.noPlayer) sheepAt(0.2, 2, Math.PI + 0.35, 1.05);            // 플레이어
  if (!o.noQueue) {
  sheepAt(-1.2, -2.0, -2.3, 0.85);                  // 줄 선 양 1
  sheepAt(0.2, -0.6, -2.3, 0.85);                   // 줄 선 양 2
  sheepAt(-3.4, -4.0, -2.3, 0.8, false, true);      // 막 털 깎인 양
  }
  if (!o.noNpc) {
  sheepAt(4.2, 0.5, 1.2, 0.9, true);                // 누워 자는 양
  sheepAt(5.4, -2.8, 2.6, 0.85);
  sheepAt(-5.2, 3.2, 0.6, 0.9, true);
  sheepAt(7.5, -6, -0.4, 0.8);
  sheepAt(-8.5, -2.5, 1.9, 0.8);
  sheepAt(2.5, -8.5, 0.3, 0.8, true);
  sheepAt(8.5, 1.5, -1.6, 0.85);
  sheepAt(-2.8, 6.5, 2.4, 0.85);
  }
  if (o.dog) {
    const d = new THREE.Group(); d.position.set(3, 0, 4.5); d.rotation.y = -0.6; scene.add(d);
    add(d, S(0.5), M(0x24242a), 0, 0.7, 0, 1.6, 0.8, 0.8);
    add(d, S(0.35), M(0xffffff), 0.75, 0.95, 0);
    add(d, S(0.3), M(0x24242a), 0.95, 1.15, 0, 1.1, 1, 0.9);
    [[-0.4, 0.25], [-0.4, -0.25], [0.4, 0.25], [0.4, -0.25]].forEach(([x, z]) => add(d, new THREE.CapsuleGeometry(0.1, 0.4, 4, 8), M(0xffffff), x, 0.3, z));
  }
  return { solids };
}

function buildSheep(o, M, S, add, shorn) {
  const sheep = new THREE.Group();
  const wool = o.mat === 'toon' || o.mat === 'flat' ? M(o.wool ?? 0xffffff) : new THREE.MeshPhysicalMaterial({
    color: o.wool ?? 0xffffff, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xfff6ee), sheenRoughness: 0.6,
    emissive: new THREE.Color(o.woolGlow ?? 0xfff3ea), emissiveIntensity: o.woolGlowI ?? 0.16 });
  const skin = M(o.face ?? 0xf7dccb);
  const dark = M(0x1d1a22, o.mat === 'standard' || !o.mat ? { roughness: 0.15 } : {});
  const hoof = M(0x9a7b6c), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cheek = new THREE.MeshBasicMaterial({ color: 0xff9fb0, transparent: true, opacity: 0.75 });
  const body = new THREE.Group(); body.position.y = 1.12; sheep.add(body);
  if (shorn) add(body, S(0.82), M(o.face ?? 0xf7dccb), 0, -0.1, 0, 0.95, 0.78, 1.15);
  else {
    add(body, S(0.95), wool, 0, 0, 0, 1.05, 0.9, 1.15);
    const n = o.mat === 'flat' ? 40 : 70;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * i;
      const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      if (y < -0.75) continue;
      add(body, S(0.31 + 0.05 * Math.sin(i * 2.3), o.mat === 'flat' ? 6 : 16), wool, x * 0.92, y * 0.76, z * 1.02);
    }
  }
  add(body, S(0.24, 14), wool, 0, 0.12, -1.25);
  const leg = new THREE.CapsuleGeometry(0.17, 0.32, 6, 12);
  [[-0.45, 0.55], [0.45, 0.55], [-0.45, -0.55], [0.45, -0.55]].forEach(([x, z]) => { add(sheep, leg, skin, x, 0.34, z); add(sheep, S(0.19, 12), hoof, x, 0.12, z, 1, 0.6, 1); });
  const head = new THREE.Group(); head.position.set(0, 1.62, 1.22); sheep.add(head);
  add(head, S(0.62), skin, 0, 0, 0, 1, 0.9, 0.86);
  [[0, 0.5, -0.05, 0.3], [-0.26, 0.42, 0.02, 0.24], [0.26, 0.42, 0.02, 0.24], [0, 0.58, -0.22, 0.24]].forEach(([x, y, z, r]) => add(head, S(r, 14), wool, x, y, z));
  [-1, 1].forEach((s) => {
    const e = add(head, S(0.2, 12), skin, s * 0.72, 0.06, -0.05, 1.4, 0.55, 0.9); e.rotation.z = s * -0.5;
    add(head, S(0.1, 16), dark, s * 0.22, 0.02, 0.5, 1, 1.2, 0.6);
    add(head, S(0.032, 8), white, s * 0.22 + 0.03, 0.07, 0.56);
    add(head, S(0.09, 12), cheek, s * 0.36, -0.14, 0.42, 1.2, 0.7, 0.4);
  });
  return sheep;
}
