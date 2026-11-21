import { CATALOG, FARMS, SHORE_Z, WORLD_R } from '../../server/src/shared';
import type { GameState } from '../../server/src/protocol';
import { PLACES } from './land';

// 지도 세 가지: 화면 구석의 작은 지도, 크게 보는 농장 지도, 농장을 고르는 뉴질랜드 지도. 그리고 투표 목록.

export interface Dot { x: number; z: number; friend?: boolean }
export interface MapView { me: { x: number; z: number; ry: number }; others: Dot[]; npcs: Dot[]; dog: Dot | null; built: string[] }

const BUILT_AT: Record<string, [number, number]> = { tree: [11, 13], hay: [-11, 10], lighthouse: [34, -58], windmill: [46, -12] };

/** 농장 지도 그리기 (북쪽 = 바다가 위). size는 캔버스 한 변 픽셀 */
export function drawFarm(c: HTMLCanvasElement, v: MapView, big = false) {
  const g = c.getContext('2d')!, W = c.width, R = WORLD_R + 6, k = W / (R * 2), X = (x: number) => (x + R) * k, Y = (z: number) => (z + R) * k;
  g.clearRect(0, 0, W, W);
  g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.clip();
  g.fillStyle = '#A9DE88'; g.fillRect(0, 0, W, W);
  g.fillStyle = '#EADFB8'; g.fillRect(0, 0, W, Y(SHORE_Z + 3));
  g.fillStyle = '#58B4E0'; g.fillRect(0, 0, W, Y(SHORE_Z - 2));
  const blob = (p: { x: number; z: number }, r: number, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(X(p.x), Y(p.z), r * k, 0, 7); g.fill(); };
  blob(PLACES.forest, 17, '#6FB86A'); blob(PLACES.lookout, 12, '#C4E8A4'); blob(PLACES.pond, 5.5, '#58B4E0'); blob(PLACES.flowers, 13, '#F7C6DA'); blob(PLACES.yard, 13, '#C9EBB0');
  const box = (x: number, z: number, s: number, col: string) => { g.fillStyle = col; g.fillRect(X(x) - s / 2, Y(z) - s / 2, s, s); };
  const u = W / 96;
  box(-5, -6, 7 * u, '#D8433B'); box(PLACES.milk.x + 4, PLACES.milk.z - 4, 6 * u, '#3F7FB8'); box(PLACES.port.x, -68, 4 * u, '#9B7B5B'); box(PLACES.port.x + 8, -70, 6 * u, '#D8433B');
  for (const id of v.built) { const p = BUILT_AT[id]; if (p) box(p[0], p[1], 5 * u, '#8A5A3A'); }
  g.fillStyle = '#7A5A3A'; g.beginPath(); g.moveTo(X(PLACES.lookout.x), Y(PLACES.lookout.z) - 5 * u); g.lineTo(X(PLACES.lookout.x) + 4 * u, Y(PLACES.lookout.z) + 3 * u); g.lineTo(X(PLACES.lookout.x) - 4 * u, Y(PLACES.lookout.z) + 3 * u); g.fill();
  const dot = (d: Dot, r: number, col: string, ring = '#24324A') => { g.beginPath(); g.arc(X(d.x), Y(d.z), r * u, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = u; g.strokeStyle = ring; g.stroke(); };
  for (const n of v.npcs) dot(n, 1.6, '#FFE27A', '#B89A2E');
  for (const o of v.others) dot(o, 2, o.friend ? '#FF7FA8' : '#FFFFFF');
  if (v.dog) dot(v.dog, 2.2, '#24242A', '#FFFFFF');
  // 나: 방향이 보이는 화살표
  g.save(); g.translate(X(v.me.x), Y(v.me.z)); g.rotate(Math.PI - v.me.ry);
  g.beginPath(); g.moveTo(0, -5.5 * u); g.lineTo(4 * u, 4 * u); g.lineTo(0, 2 * u); g.lineTo(-4 * u, 4 * u); g.closePath();
  g.fillStyle = '#2F6FA8'; g.fill(); g.lineWidth = 1.2 * u; g.strokeStyle = '#fff'; g.stroke(); g.restore();
  if (big) {
    g.font = `${5.6 * u}px 'Jua', sans-serif`; g.textAlign = 'center'; g.fillStyle = '#24324A';
    const below: unknown[] = [PLACES.port, PLACES.milk, PLACES.pond, PLACES.flowers]; // 글자가 겹치지 않게 위아래로 나눈다
    for (const p of Object.values(PLACES)) g.fillText(p.name, X(p.x), Y(p.z) + (below.includes(p) ? 13 * u : -9 * u));
  }
  g.restore();
}

// ── 뉴질랜드 지도 (대략 그린 해안선)
const N = [[172.7, -34.4], [173.3, -35], [174.3, -35.3], [174.8, -36.3], [175.5, -36.5], [175.9, -37.4], [176.9, -37.8], [178.4, -37.7], [177.9, -39.1], [176.9, -39.5], [176.3, -41], [175.3, -41.6], [174.8, -41.3], [175, -40.6], [175, -39.9], [174, -39.6], [173.8, -39.3], [174.6, -38.8], [174.7, -37.9], [174.5, -37], [174.2, -36.3], [173.4, -35.5], [173, -35]];
const So = [[172.7, -40.5], [173, -40.8], [174.2, -41], [174.3, -41.7], [173.7, -42.4], [172.8, -43.2], [173.1, -43.8], [172, -44], [171.2, -44.4], [170.9, -45.2], [170.7, -45.9], [169.7, -46.5], [168.4, -46.6], [167.5, -46.2], [166.5, -45.9], [166.9, -45], [167.8, -44.4], [168.9, -43.9], [170.2, -43], [171.2, -42.4], [171.6, -41.7], [172.1, -40.8]];
const px = (lon: number) => ((lon - 165.8) * 15.1).toFixed(1), py = (lat: number) => ((-34 - lat) * 20 + 6).toFixed(1);
const poly = (pts: number[][]) => pts.map(([lo, la]) => `${px(lo)},${py(la)}`).join(' ');

export function renderNz(el: HTMLElement, built: string[], here: string, go: (id: string) => void) {
  const open = (id: string) => id === 'auckland' || built.includes(id);
  el.innerHTML = `<svg viewBox="-40 0 280 276" role="img" aria-label="Map of New Zealand farms"><rect x="-40" width="280" height="276" rx="14" fill="#D4F0FF"/>
  <polygon points="${poly(N)}" fill="#A9DE88"/><polygon points="${poly(So)}" fill="#A9DE88"/><ellipse cx="${px(167.9)}" cy="${py(-47)}" rx="5" ry="3.5" fill="#A9DE88"/>
  ${FARMS.map((f) => {
    const o = open(f.id), left = f.lon < 174 || f.id === 'hamilton';
    return `<g class="${o ? 'pin' : ''}" data-farm="${o ? f.id : ''}" ${o ? 'tabindex="0" role="button"' : ''} aria-label="${f.name}${o ? '' : ' (not built yet)'}">
    <circle cx="${px(f.lon)}" cy="${py(f.lat)}" r="${f.id === here ? 6 : 4.5}" fill="${f.id === here ? '#2F6FA8' : o ? '#D8433B' : '#B8C4D0'}" stroke="#fff" stroke-width="1.5"/>
    <text x="${Number(px(f.lon)) + (left ? -8 : 8)}" y="${Number(py(f.lat)) + 3}" text-anchor="${left ? 'end' : 'start'}" opacity="${o ? 1 : 0.55}">${f.name}${f.id === here ? ' (you)' : ''}</text></g>`;
  }).join('')}</svg>`;
  el.querySelectorAll<SVGGElement>('.pin').forEach((p) => {
    const id = p.dataset.farm!; if (!id || id === here) return;
    p.addEventListener('click', () => go(id)); p.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(id); });
  });
}

/** 금고와 투표 목록 */
export function renderVote(textEl: HTMLElement, listEl: HTMLElement, st: GameState, voted: boolean, vote: (id: string) => void) {
  const money = (n: number) => `NZ$ ${n.toLocaleString('en-NZ')}`;
  const cheapest = CATALOG.find((c) => !st.built.includes(c.id));
  textEl.textContent = !cheapest ? `${money(st.vault)} in the fund. Everything is built. Legendary flock!`
    : st.vote.open ? `${money(st.vault)} in the fund. Voting is open: one vote per sheep per day, counted at noon (NZ time). The winner gets built if the fund can pay for it.`
      : `${money(st.vault)} in the fund. Every fleece and bucket of milk adds to it. Voting opens at ${money(cheapest.price)}.`;
  listEl.replaceChildren(...st.vote.options.map((id) => {
    const c = CATALOG.find((x) => x.id === id)!, row = document.createElement('div'), name = document.createElement('b'), info = document.createElement('small'), b = document.createElement('button');
    row.className = 'vote'; name.textContent = `${c.name} · ${money(c.price)}`;
    const n = st.vote.counts[id] || 0;
    info.textContent = `${c.blurb}. ${n} vote${n === 1 ? '' : 's'}${st.vault < c.price ? `, needs ${money(c.price - st.vault)} more` : ''}`;
    b.textContent = voted ? 'Voted' : 'Vote'; b.disabled = voted || !st.vote.open;
    b.addEventListener('click', () => vote(id));
    row.append(name, b, info); return row;
  }));
}
