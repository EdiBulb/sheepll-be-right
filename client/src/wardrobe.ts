import * as THREE from 'three';
import type { Store } from './store';

// 옷장: 사는 게 아니라 모으는 것. 목장에서 지내며 하나씩 받는다 (결제 없음).
// 모두 같은 하얀 양이라는 원칙을 지키려고, 머리에 다는 작은 소품 하나만 쓸 수 있다.
// 다른 양에게도 보인다 (서버가 id만 전달).

export interface Item { id: string; name: string; how: string; unlocked: (s: Store) => boolean }

export const ITEMS: Item[] = [
  { id: 'daisy', name: 'Daisy', how: 'Get shorn once', unlocked: (s) => s.shears >= 1 },
  { id: 'bow', name: 'Ribbon bow', how: 'Give milk 3 times', unlocked: (s) => s.milks >= 3 },
  { id: 'scarf', name: 'Red scarf', how: 'Get shorn 5 times', unlocked: (s) => s.shears >= 5 },
  { id: 'crown', name: 'Flower crown', how: 'Land 3 clean blows (6 swipes or fewer)', unlocked: (s) => s.cleanBlows >= 3 },
  { id: 'beanie', name: 'Knitted beanie', how: 'Visit the farm on 3 different days', unlocked: (s) => s.days.length >= 3 },
];
export const isItem = (id: string) => ITEMS.some((i) => i.id === id);

const M = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
const S = (r: number) => new THREE.SphereGeometry(r, 16, 12);

/** 소품 3D 모델. 양 머리(head) 좌표 기준 */
function build(id: string) {
  const g = new THREE.Group(); g.name = 'accessory';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  if (id === 'daisy') {
    const f = new THREE.Group(); f.position.set(0.42, 0.38, 0.22); f.rotation.set(0.2, 0.6, -0.5); g.add(f);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, p = new THREE.Mesh(S(0.06), M(0xffffff)); p.scale.set(1.6, 0.5, 0.8); p.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0); p.rotation.z = a; f.add(p); }
    const c = new THREE.Mesh(S(0.06), M(0xffc83d)); c.position.z = 0.02; f.add(c);
  } else if (id === 'bow') {
    const pink = M(0xff7fa8);
    const l = add(new THREE.ConeGeometry(0.11, 0.2, 12), pink, -0.11, 0.62, 0.05); l.rotation.z = Math.PI / 2;
    const r = add(new THREE.ConeGeometry(0.11, 0.2, 12), pink, 0.11, 0.62, 0.05); r.rotation.z = -Math.PI / 2;
    add(S(0.06), pink, 0, 0.62, 0.05);
  } else if (id === 'scarf') {
    const red = M(0xd8433b);
    const t = add(new THREE.TorusGeometry(0.42, 0.11, 10, 28), red, 0, -0.42, -0.15); t.rotation.x = Math.PI / 2 - 0.25;
    const tail = add(new THREE.BoxGeometry(0.16, 0.38, 0.07), red, 0.2, -0.62, 0.22); tail.rotation.z = 0.2;
    [0xffffff].forEach((c) => { const s = add(new THREE.TorusGeometry(0.42, 0.03, 6, 28), M(c), 0, -0.36, -0.13); s.rotation.x = Math.PI / 2 - 0.25; });
  } else if (id === 'crown') {
    const cols = [0xff8fb3, 0xffd23f, 0xb28dff, 0xffffff, 0x7fd0ff];
    add(new THREE.TorusGeometry(0.4, 0.03, 6, 28), M(0x5fa64a), 0, 0.62, -0.08).rotation.x = Math.PI / 2;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; add(S(0.075), M(cols[i % cols.length]), Math.cos(a) * 0.4, 0.66, -0.08 + Math.sin(a) * 0.4); }
  } else if (id === 'beanie') {
    const blue = M(0x2f6fa8);
    const cap = add(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), blue, 0, 0.5, -0.08); cap.scale.set(1, 0.9, 1);
    add(new THREE.TorusGeometry(0.4, 0.07, 8, 28), M(0xf3ead8), 0, 0.52, -0.08).rotation.x = Math.PI / 2;
    add(S(0.12), M(0xf3ead8), 0, 0.92, -0.08);
  }
  return g;
}

/** 양에 소품을 씌운다 (이전 소품은 뗀다) */
export function wear(sheep: THREE.Group, id: string) {
  const head = sheep.userData.head as THREE.Group;
  head.children.filter((c) => c.name === 'accessory').forEach((c) => head.remove(c));
  if (id && isItem(id)) head.add(build(id));
}
