import * as THREE from 'three';

const GEO = new Map(); // 같은 크기 구는 한 번만 만들어 모든 양이 함께 쓴다

// 파라미터형 양 — 시안 비교용
export function makeSheep(p) {
  const g = new THREE.Group();
  const woolM = new THREE.MeshPhysicalMaterial({ color: p.wool ?? 0xffffff, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xfff6ee), sheenRoughness: 0.6, emissive: new THREE.Color(p.woolGlow ?? 0xfff3ea), emissiveIntensity: 0.16 });
  const faceM = new THREE.MeshStandardMaterial({ color: p.face ?? 0xf7dccb, roughness: 0.7 });
  const legM = new THREE.MeshStandardMaterial({ color: p.leg ?? p.face ?? 0xf7dccb, roughness: 0.7 });
  const hoofM = new THREE.MeshStandardMaterial({ color: p.hoof ?? 0x9a7b6c, roughness: 0.6 });
  const earIn = new THREE.MeshStandardMaterial({ color: p.earIn ?? 0xf5b7b5, roughness: 0.7 });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: 0.12 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cheekM = new THREE.MeshBasicMaterial({ color: p.cheekColor ?? 0xff9fb0, transparent: true, opacity: 0.75 });
  const hornM = new THREE.MeshStandardMaterial({ color: 0xe8d6b0, roughness: 0.5 });
  const S = (r, s = 32) => { const k = r.toFixed(3) + '_' + s; if (!GEO.has(k)) GEO.set(k, new THREE.SphereGeometry(r, s, Math.round(s * 0.75))); return GEO.get(k); };
  const add = (par, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; par.add(m); return m; };

  const [bx, by, bz] = p.body ?? [1, 1, 1];
  const legLen = p.legLen ?? 0.32;
  const ws = p.woolScale ?? 1;
  const bodyY = Math.max(0.78 + legLen + (p.lift ?? 0), 0.72 * ws * (p.body?.[1] ?? 1) + 0.06);
  const body = new THREE.Group(); body.position.y = bodyY; body.scale.setScalar(p.shorn ? 1 : ws); g.add(body);
  if (p.shorn) { add(body, S(0.8), faceM, 0, -0.12, 0, 0.95 * bx, 0.78 * by, 1.12 * bz); }
  else add(body, S(0.95), woolM, 0, 0, 0, 1.05 * bx, 0.9 * by, 1.15 * bz);
  const woolCore = body.children[body.children.length - 1];
  const skinCore = add(body, S(0.95), faceM, 0, 0, 0, 1.0 * bx, 0.86 * by, 1.1 * bz); skinCore.visible = false;
  const puffs = [];
  const n = p.puffN ?? 70, pr = p.puffR ?? 0.31;
  const puffGeo = p.curly ? new THREE.TorusGeometry(pr * 0.62, pr * 0.32, 12, 24) : null;
  for (let i = 0; i < (p.shorn ? 0 : n); i++) {
    const t = (i + 0.5) / n, phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * i;
    const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
    if (y < -0.75) continue;
    const r = pr * (1 + (p.jitter ?? 0.16) * Math.sin(i * 2.3));
    const px = x * 0.92 * bx, py = y * 0.76 * by, pz = z * 1.02 * bz;
    if (puffGeo) { const m = add(body, puffGeo, woolM, px, py, pz); puffs.push(m); m.lookAt(px * 3, py * 3, pz * 3); m.scale.setScalar(r / pr); }
    else puffs.push(add(body, S(r, 20), woolM, px, py, pz));
  }
  add(body, S(0.24, 18), woolM, 0, 0.12 * by, -1.2 * bz - 0.05);

  if (legLen > 0.01) {
    const leg = new THREE.CapsuleGeometry(p.legR ?? 0.17, legLen, 6, 16);
    const lx = 0.45 * bx, lz = 0.55 * bz;
    [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]].forEach(([x, z]) => { add(g, leg, legM, x, 0.17 + legLen / 2, z); add(g, S(0.19, 16), hoofM, x, 0.12, z, 1, 0.6, 1); });
  }

  const hs = p.head ?? 1;
  const head = new THREE.Group(); const hw = p.shorn ? 0.85 : ws; head.position.set(0, bodyY + 0.5 * by * hw + (p.headUp ?? 0), 1.1 * bz * hw + 0.12 * hs); head.scale.setScalar(hs); g.add(head);
  add(head, S(0.62), faceM, 0, 0, 0, 1, 0.9, 0.86);
  const tuft = p.tuft ?? 1;
  if (tuft > 0) [[0, 0.5, -0.05, 0.3], [-0.26, 0.42, 0.02, 0.24], [0.26, 0.42, 0.02, 0.24], [-0.13, 0.58, -0.22, 0.24], [0.13, 0.58, -0.22, 0.24], [0, 0.42, 0.22, 0.2]]
    .forEach(([x, y, z, r]) => add(head, S(r * tuft, 20), woolM, x, y + (tuft - 1) * 0.15, z));
  const ears = [], eyes = [];
  [-1, 1].forEach((s) => {
    if (p.ears !== 'none') {
      const ear = new THREE.Group(); head.add(ear); ears.push(ear); ear.userData.side = s;
      if (p.ears === 'floppy') { ear.position.set(s * 0.58, -0.02, 0.08); ear.rotation.z = s * -1.35; ear.rotation.x = 0.25; }
      else if (p.ears === 'up') { ear.position.set(s * 0.4, 0.42, -0.08); ear.rotation.z = s * 0.5; }
      else { ear.position.set(s * 0.62, 0.08, -0.05); ear.rotation.z = s * -0.5; ear.rotation.y = s * 0.3; }
      const el = p.ears === 'floppy' ? 2.5 : 1.4;
      add(ear, S(0.2, 20), faceM, s * 0.12, 0, 0, el, 0.55, 0.9);
      add(ear, S(0.15, 20), earIn, s * 0.14, 0, 0.07, el * 0.93, 0.42, 0.5);
    }
    const es = p.eye ?? 1, ex = s * (p.eyeGap ?? 0.22), ey = (p.eyeY ?? 0.02);
    if (p.sleepy) {
      const lid = add(head, new THREE.TorusGeometry(0.075 * es, 0.018, 10, 20, Math.PI), eyeM, ex, ey, 0.52);
      lid.rotation.z = Math.PI;
    } else {
      // 눈은 깜빡이거나 감을 수 있게 묶어 둔다
      const eye = new THREE.Group(); eye.position.set(ex, ey, 0.5); head.add(eye); eyes.push(eye);
      add(eye, S(0.1 * es, 24), eyeM, 0, 0, 0, 1, 1.2, 0.6);
      add(eye, S(0.032 * es, 12), white, 0.03 * es, 0.05 * es, 0.06);
      add(eye, S(0.016 * es, 10), white, -0.03 * es, -0.03 * es, 0.06);
    }
    if (p.cheek !== false) add(head, S(0.09, 16), cheekM, s * 0.36, -0.14, 0.42, 1.2, 0.7, 0.4);
    if (p.horns) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.25, 0.15, -0.15), new THREE.Vector3(s * 0.42, -0.05, -0.2), new THREE.Vector3(s * 0.38, -0.25, 0.02), new THREE.Vector3(s * 0.25, -0.18, 0.12)]);
      const h = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.1, 12, false), hornM); h.position.set(s * 0.38, 0.28, 0.0); h.scale.setScalar(1.35); h.castShadow = true; head.add(h);
    }
  });
  if (p.tag) add(head, new THREE.BoxGeometry(0.16, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0xffd23f }), 0.52, 0.5, 0.02); // NPC 양의 노란 농장 태그
  add(head, S(0.05, 12), new THREE.MeshStandardMaterial({ color: 0xe8a0a0, roughness: 0.5 }), 0, -0.09, 0.53, 1.5, 0.9, 0.6); // 분홍 코
  const mouth = new THREE.MeshStandardMaterial({ color: 0x6b4a45 });
  if (p.mouth !== 'none') [-1, 1].forEach((s) => { const m = add(head, new THREE.TorusGeometry(0.05, 0.014, 10, 20, Math.PI), mouth, s * 0.05, -0.17, 0.5); m.rotation.z = Math.PI; });
  const shornM = add(g, S(0.8), faceM, 0, 0, 0, 0.95 * bx, 0.78 * by, 1.12 * bz); shornM.visible = false;
  const tail = body.children[body.children.length - 1];
  g.userData = { body, head, shornM, legLen, by, bz, hs, puffs, woolCore, skinCore, ears, eyes, tail, phase: Math.random() * 10, earBase: ears.map((e) => e.rotation.z) };
  return g;
}

// 털 양 w: 0(막 깎음) ~ 1(구름 공)
export function setWool(sheep, w) {
  const { body, head, shornM, legLen, by, bz, hs } = sheep.userData;
  const shorn = w < 0.08;
  body.visible = !shorn; shornM.visible = shorn;
  const ws = 0.62 + w * 0.88;
  const bodyY = Math.max(0.78 + legLen, 0.72 * ws * by + 0.06);
  body.position.y = bodyY; body.scale.setScalar(ws);
  shornM.position.y = 0.78 + legLen - 0.1;
  const hw = shorn ? 0.85 : ws;
  head.position.y = (shorn ? 0.78 + legLen : bodyY) + 0.5 * by * hw;
  head.position.z = 1.1 * bz * hw + 0.12 * hs;
}

/**
 * 얼굴과 자세의 작은 움직임. setWool() 다음에 부른다.
 * graze 0~1: 고개를 숙여 풀을 뜯음, asleep: 눈을 감음
 */
export function animate(sheep, t, graze = 0, asleep = false) {
  const u = sheep.userData, tt = t + u.phase;
  const blink = asleep ? 0.12 : (tt % 4.2 < 0.12 ? 0.15 : 1);
  for (const e of u.eyes) e.scale.y += (blink - e.scale.y) * 0.5;
  // 귀: 가끔 한 번씩 털기
  const flick = (tt % 6.5 < 0.35) ? Math.sin((tt % 6.5) / 0.35 * Math.PI * 2) * 0.35 : 0;
  u.ears.forEach((e, i) => { e.rotation.z = u.earBase[i] + flick * e.userData.side; });
  u.tail.position.x = Math.sin(tt * 7) * 0.05 * (tt % 5 < 1.2 ? 1 : 0); // 꼬리 살랑
  u.head.position.y -= 0.5 * graze; u.head.position.z += 0.12 * graze;
  u.head.rotation.x = 0.75 * graze + (graze > 0.5 ? Math.sin(tt * 9) * 0.06 : 0);
}
