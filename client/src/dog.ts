import * as THREE from 'three';
import { heightAt } from './land';

// 양치기 개 베스: 서버가 위치를 정하고, 여기서는 부드럽게 따라 그리기만 한다
export function createDog(scene: THREE.Scene) {
  const g = new THREE.Group(); g.visible = false; g.userData.dynamic = true; scene.add(g);
  const M = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  const S = (r: number) => new THREE.SphereGeometry(r, 14, 10), black = M(0x24242a), white = M(0xffffff);
  add(S(0.5), black, 0, 0.75, 0, 0.8, 0.8, 1.6);
  add(S(0.36), white, 0, 0.72, 0.6, 0.85, 0.9, 0.8);                 // 가슴
  add(S(0.3), black, 0, 1.15, 0.95, 0.95, 1, 1.1);                   // 머리
  add(S(0.16), white, 0, 1.08, 1.25, 0.9, 0.8, 1.2);                 // 주둥이
  add(S(0.05), black, 0, 1.12, 1.44);
  [-1, 1].forEach((s) => add(new THREE.ConeGeometry(0.1, 0.24, 6), black, s * 0.18, 1.45, 0.88));
  const tail = add(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), black, 0, 0.95, -0.9); tail.rotation.x = -0.9;
  const legs = [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]].map(([x, z]) => add(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), white, x, 0.3, z));
  let tx = 0, tz = 0, try_ = 0, first = true;
  return {
    group: g,
    get on() { return g.visible; },
    show(on: boolean) { g.visible = on; first = true; },
    set(x: number, z: number, ry: number) { tx = x; tz = z; try_ = ry; if (first) { g.position.set(x, heightAt(x, z), z); first = false; } },
    update(dt: number, t: number) {
      if (!g.visible) return;
      const k = Math.min(1, dt * 10), dx = (tx - g.position.x) * k, dz = (tz - g.position.z) * k, moving = Math.hypot(dx, dz) > 0.02;
      g.position.x += dx; g.position.z += dz; g.position.y = heightAt(g.position.x, g.position.z) + (moving ? Math.abs(Math.sin(t * 16)) * 0.12 : 0);
      g.rotation.y += Math.atan2(Math.sin(try_ - g.rotation.y), Math.cos(try_ - g.rotation.y)) * k;
      legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 16 + (i % 3 ? 0 : Math.PI)) * 0.7 : 0; });
      tail.rotation.z = Math.sin(t * 12) * 0.4;
    },
  };
}
