import * as THREE from 'three';
import type { Totals } from '../../server/src/protocol';

const $ = (id: string) => document.getElementById(id)!;
let toastT = 0;
export function toast(text: string, seconds = 2.6) { $('toast').textContent = text; $('toast').classList.add('on'); toastT = seconds; }

export function setTotals(t: Totals) {
  $('money').textContent = `NZ$ ${t.money.toLocaleString('en-NZ')} exported`;
  const ships = Math.floor(t.money / 10_000);
  $('detail').textContent = `Wool ${t.kg.toLocaleString('en-NZ')} kg\nMilk ${t.litres.toLocaleString('en-NZ')} L\nShips sailed ${ships}`;
}
export function setOnline(n: number) { $('online').textContent = `${n} sheep · Auckland`; }
export function initHud() {
  $('money').addEventListener('click', () => { const d = $('detail'); d.hidden = !d.hidden; $('money').setAttribute('aria-expanded', String(!d.hidden)); });
}
export function showControls(on: boolean) { document.querySelectorAll<HTMLElement>('#joy, .btns').forEach((el) => (el.style.visibility = on ? '' : 'hidden')); }

// ── 양 머리 위 말풍선
const bubbles: { el: HTMLElement; target: THREE.Object3D; t: number; h: number }[] = [];
const v = new THREE.Vector3();
export function say(target: THREE.Object3D, text: string, h = 3.2) {
  const old = bubbles.findIndex((b) => b.target === target); if (old >= 0) { bubbles[old].el.remove(); bubbles.splice(old, 1); }
  const el = document.createElement('p'); el.className = 'bubble'; el.textContent = text; document.body.appendChild(el);
  bubbles.push({ el, target, t: 1.6, h });
}
export function updateHud(dt: number, cam: THREE.Camera) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.t -= dt;
    if (b.t <= 0 || !b.target.parent) { b.el.remove(); bubbles.splice(i, 1); continue; }
    b.target.getWorldPosition(v); v.y += b.h; v.project(cam);
    b.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; b.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    b.el.style.display = v.z < 1 ? '' : 'none';
  }
}
