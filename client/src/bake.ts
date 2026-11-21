// 움직이지 않는 장식을 재질별로 하나로 합쳐 그리기 횟수(draw call)를 줄인다 (오늘의 해 bake.ts).
// 움직이는 것(userData.dynamic), 투명한 것, 스프라이트는 그대로 둔다. 그림자 설정이 같은 것끼리만 합친다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CELL = 30;
export function bakeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), tmpM = new THREE.Matrix4(), wp = new THREE.Vector3();
  const cand: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o !== root && (o.userData.dynamic || !o.visible)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material)) {
      const mat = m.material as THREE.Material;
      if (!mat.transparent && m.geometry.attributes.position) cand.push(m);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean }>();
  for (const m of cand) {
    const mat = m.material as THREE.Material & { map?: THREE.Texture | null; vertexColors?: boolean };
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const keep = ['position', 'normal', ...(mat.map ? ['uv'] : []), ...(mat.vertexColors ? ['color'] : [])];
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (keep.some((k) => !g.attributes[k])) { g.dispose(); continue; }
    g.morphAttributes = {};
    tmpM.multiplyMatrices(inv, m.matrixWorld); g.applyMatrix4(tmpM);
    m.getWorldPosition(wp);
    const key = `${mat.uuid}|${keep.join(',')}|${m.castShadow}|${m.receiveShadow}|${Math.floor(wp.x / CELL)},${Math.floor(wp.z / CELL)}`;
    let b = buckets.get(key); if (!b) { b = { mat, geos: [], cast: m.castShadow, recv: m.receiveShadow }; buckets.set(key, b); }
    b.geos.push(g); m.userData.baked = true;
  }
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.name = 'baked'; root.add(mesh);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
  }
  for (let i = cand.length - 1; i >= 0; i--) {
    const m = cand[i]; if (!m.userData.baked || !m.parent) continue;
    for (const c of [...m.children]) if (!c.userData.baked) m.parent.attach(c);
    m.parent.remove(m);
  }
  // 빈 그룹 정리
  const empty: THREE.Object3D[] = [];
  root.traverse((o) => { if (o !== root && o.type === 'Group' && o.children.length === 0 && !o.userData.dynamic) empty.push(o); });
  for (const o of empty) o.parent?.remove(o);
  return { meshes: cand.length, draws: buckets.size };
}
