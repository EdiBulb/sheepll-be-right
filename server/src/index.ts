import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Emote, GameState, MilkResult, Move, PlayerInfo, ShearResult, St, Totals, VoteResult, Welcome } from './protocol';
import { CATALOG, FARMS, GATHER, SHORE_Z, WORLD_R, nzNow } from './shared';
import { loadState, saveState, usingRedis } from './store';

const PORT = Number(process.env.PORT || 3001);
const ORIGIN = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : '*';
const GROW_MS = Number(process.env.GROW_MS || 10 * 60_000); // 털이 다 자라는 시간
const MILK_MS = Number(process.env.MILK_MS || 3 * 60_000);
const CAP = Number(process.env.CHANNEL_CAP || 30);         // 농장 한 채널의 양 수
const HERD_MS = Number(process.env.HERD_MS || 0);          // 양몰이 간격 (0 = 15~20분 사이 무작위)
const TALLY_MS = Number(process.env.TALLY_MS || 0);        // 테스트용: 정오를 기다리지 않고 이 간격으로 개표
const SHEAR_PRICE = 150, SHEAR_KG = 4.5, CLEAN_BONUS = 30, HAPPY_BONUS = 40, MILK_PRICE = 30, MILK_L = 0.5;
const FRONT_TIMEOUT = 60_000;                               // 줄 맨 앞에서 너무 오래 있으면 뺌

// ── 저장되는 상태: 누적 수출액, 금고, 지은 것, 투표
interface Saved { totals: Totals; vault: number; built: string[]; counts: Record<string, number>; voters: Record<string, string>; armedDay: string; lastTally: string }
const S: Saved = { totals: { money: 0, kg: 0, litres: 0 }, vault: 0, built: [], counts: {}, voters: {}, armedDay: '', lastTally: '' };
const save = () => saveState(S);

const unbuilt = () => CATALOG.filter((c) => !S.built.includes(c.id));
function gameState(): GameState {
  const u = unbuilt(), options = u.slice(0, 3).map((c) => c.id);
  return { vault: S.vault, built: S.built, vote: { open: u.length > 0 && S.vault >= u[0].price, options, counts: Object.fromEntries(options.map((id) => [id, S.counts[id] || 0])) } };
}
function earn(amount: number) { S.totals.money += amount; S.vault += amount; }
const farmOk = (id: unknown) => (id === 'auckland' || (typeof id === 'string' && S.built.includes(id) && FARMS.some((f) => f.id === id)) ? (id as string) : 'auckland');

/** 개표: 살 수 있는 후보 중 표가 가장 많은 것을 짓는다 (표가 하나도 없으면 아무것도 안 지음) */
function tally() {
  const st = gameState();
  const can = st.vote.options.map((id) => CATALOG.find((c) => c.id === id)!).filter((c) => c.price <= S.vault && (S.counts[c.id] || 0) > 0);
  S.lastTally = nzNow().day;
  if (!st.vote.open || !can.length) { save(); return; }
  const win = can.reduce((a, b) => ((S.counts[b.id] || 0) > (S.counts[a.id] || 0) ? b : a));
  S.vault -= win.price; S.built.push(win.id); S.counts = {}; S.voters = {}; save();
  io.emit('built', win.id, gameState());
  console.log('built', win.id);
}
// 매일 뉴질랜드 정오에 개표. 오후에 열린 투표는 다음 날 정오까지 기다린다
setInterval(() => {
  const { day, hour } = nzNow();
  if (hour < 12) { if (gameState().vote.open && S.armedDay !== day) { S.armedDay = day; save(); } }
  else if (S.armedDay === day && S.lastTally !== day) tally();
}, 30_000);
if (TALLY_MS) setInterval(tally, TALLY_MS);

// ── 채널 (농장마다 여러 개)
interface Herd { on: boolean; until: number; next: number; x: number; z: number; ry: number; homeSince: number }
interface Channel { n: number; farm: string; key: string; players: Map<string, PlayerInfo>; dirty: Set<string>; queue: string[]; frontSince: number; herd: Herd }
const channels: Channel[] = [];
const nextHerd = () => Date.now() + (HERD_MS || (15 + Math.random() * 5) * 60_000);
function pickChannel(farm: string, party: string): Channel {
  const mine = channels.filter((c) => c.farm === farm && c.players.size < CAP);
  let c = (party && mine.find((x) => [...x.players.values()].some((p) => p.party === party))) || mine[0];
  if (!c) {
    const n = channels.filter((x) => x.farm === farm).length + 1;
    c = { n, farm, key: `${farm}:${n}`, players: new Map(), dirty: new Set(), queue: [], frontSince: 0, herd: { on: false, until: 0, next: nextHerd(), x: 0, z: 0, ry: 0, homeSince: 0 } };
    channels.push(c);
  }
  return c;
}
/** uid → 마지막 털 깎인 시각 / 우유 짠 시각. 모르는 uid는 털·우유가 가득 찬 상태로 시작 */
const woolAt = new Map<string, number>(), milkAt = new Map<string, number>();

const ACCS = ['daisy', 'bow', 'scarf', 'crown', 'beanie'];
const cleanAcc = (v: unknown) => (typeof v === 'string' && ACCS.includes(v) ? v : '');
const cleanParty = (v: unknown) => (typeof v === 'string' && /^[a-z0-9]{4,12}$/i.test(v) ? v : '');

type Data = { channel?: Channel; uid: string; budget: number; lastEmote: number };
type Sock = Socket<any, any, any, Data>;

const http = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('baa'); });
const io = new Server(http, { cors: { origin: ORIGIN } });
const online = () => io.engine.clientsCount;

function setQueue(c: Channel, q: string[]) {
  if (q[0] !== c.queue[0]) c.frontSince = Date.now();
  c.queue = q; io.to(c.key).emit('queue', q);
}
function leave(s: Sock) {
  const c = s.data.channel; if (!c) return;
  c.players.delete(s.id); c.dirty.delete(s.id);
  if (c.queue.includes(s.id)) setQueue(c, c.queue.filter((id) => id !== s.id));
  s.leave(c.key); s.to(c.key).emit('left', s.id); s.data.channel = undefined;
}

io.on('connection', (s: Sock) => {
  s.data.budget = 20; s.data.lastEmote = 0; s.data.uid = s.id;

  s.on('join', (p: { uid?: string; acc?: string; farm?: string; party?: string }) => {
    leave(s);
    const now = Date.now();
    s.data.uid = typeof p?.uid === 'string' && p.uid ? p.uid.slice(0, 40) : s.id;
    const party = cleanParty(p?.party), c = pickChannel(farmOk(p?.farm), party); s.data.channel = c;
    const wa = woolAt.get(s.data.uid) ?? now - GROW_MS, ma = milkAt.get(s.data.uid) ?? now - MILK_MS;
    const a = Math.random() * Math.PI * 2;
    const me: PlayerInfo = { id: s.id, x: 3 + Math.cos(a) * 2, z: 6 + Math.sin(a) * 2, ry: Math.PI, st: 0, woolAt: wa, acc: cleanAcc(p?.acc), party };
    const w: Welcome = {
      id: s.id, now, farm: c.farm, channel: c.n, players: [...c.players.values()], totals: S.totals, state: gameState(), woolAt: wa, milkAt: ma,
      queue: c.queue, growMs: GROW_MS, milkMs: MILK_MS, online: online(), herd: c.herd.on, voted: S.voters[s.data.uid] === nzNow().day,
    };
    c.players.set(s.id, me); s.join(c.key);
    s.emit('welcome', w, me); s.to(c.key).emit('joined', me); io.emit('online', online());
  });

  s.on('m', (m: [number, number, number, St]) => {
    const c = s.data.channel, me = c?.players.get(s.id);
    if (!c || !me || !Array.isArray(m) || s.data.budget <= 0) return;
    s.data.budget--;
    const [x, z, ry, st] = m.map(Number);
    if (![x, z, ry].every(Number.isFinite)) return;
    const d = Math.hypot(x, z), k = d > WORLD_R ? WORLD_R / d : 1;
    me.x = x * k; me.z = Math.max(SHORE_Z, z * k); me.ry = ry; me.st = ([0, 1, 2, 3, 4, 5].includes(st) ? st : 0) as St;
    c.dirty.add(s.id);
  });

  s.on('emote', (e: Emote) => {
    const c = s.data.channel, now = Date.now();
    if (!c || !['baa', 'jump', 'nuzzle'].includes(e) || now - s.data.lastEmote < 400) return;
    s.data.lastEmote = now; s.to(c.key).emit('emote', s.id, e);
  });

  s.on('wear', (id: string) => {
    const c = s.data.channel, me = c?.players.get(s.id), now = Date.now();
    if (!c || !me || now - s.data.lastEmote < 400) return;
    s.data.lastEmote = now; me.acc = cleanAcc(id); s.to(c.key).emit('wear', s.id, me.acc);
  });

  s.on('enqueue', () => { const c = s.data.channel; if (c && !c.queue.includes(s.id)) setQueue(c, [...c.queue, s.id]); });
  s.on('dequeue', () => { const c = s.data.channel; if (c && c.queue.includes(s.id)) setQueue(c, c.queue.filter((id) => id !== s.id)); });

  s.on('shear', (p: { clean?: boolean; happy?: number }, ack?: (r: ShearResult) => void) => {
    const c = s.data.channel, me = c?.players.get(s.id), now = Date.now();
    if (!c || !me) return;
    const last = woolAt.get(s.data.uid) ?? now - GROW_MS;
    const wool = Math.min(1, (now - last) / GROW_MS);
    if (c.queue[0] !== s.id || wool < 0.2) { ack?.({ ok: false, at: last }); return; }
    const ratio = Math.min(1, wool / 0.85);
    // 행복한 양의 털이 더 좋은 털: 풀 뜯고 쉬면서 쌓은 행복만큼 보너스
    const happy = Math.round(HAPPY_BONUS * Math.max(0, Math.min(1, Number(p?.happy) || 0)));
    const earned = Math.round(SHEAR_PRICE * ratio) + (p?.clean ? CLEAN_BONUS : 0) + happy;
    earn(earned); S.totals.kg = Math.round((S.totals.kg + SHEAR_KG * ratio) * 10) / 10; save();
    woolAt.set(s.data.uid, now); me.woolAt = now;
    setQueue(c, c.queue.slice(1));
    ack?.({ ok: true, earned, happy, at: now });
    s.to(c.key).emit('sheared', s.id, now); io.emit('totals', S.totals, gameState());
  });

  s.on('milk', (ack?: (r: MilkResult) => void) => {
    const now = Date.now(), last = milkAt.get(s.data.uid) ?? now - MILK_MS;
    if (!s.data.channel || now - last < MILK_MS) { ack?.({ ok: false, at: last }); return; }
    earn(MILK_PRICE); S.totals.litres = Math.round((S.totals.litres + MILK_L) * 10) / 10; save();
    milkAt.set(s.data.uid, now);
    ack?.({ ok: true, earned: MILK_PRICE, at: now }); io.emit('totals', S.totals, gameState());
  });

  // 투표: 기기(uid)당 하루 한 표
  s.on('vote', (id: string, ack?: (r: VoteResult) => void) => {
    const st = gameState(), day = nzNow().day;
    if (!s.data.channel || !st.vote.open || !st.vote.options.includes(id)) { ack?.({ ok: false, why: 'closed' }); return; }
    if (S.voters[s.data.uid] === day) { ack?.({ ok: false, why: 'already' }); return; }
    S.voters[s.data.uid] = day; S.counts[id] = (S.counts[id] || 0) + 1; save();
    ack?.({ ok: true }); io.emit('state', gameState());
  });

  s.on('disconnect', () => { leave(s); io.emit('online', online()); });
});

// ── 양치기 개: 가끔 나타나 흩어진 양을 마당으로 몬다. 가장 멀리 있는 양 뒤로 돌아가서 쫓는다
function herdTick(c: Channel, now: number) {
  const h = c.herd;
  if (!h.on) {
    if (c.players.size > 0 && now >= h.next) { h.on = true; h.until = now + 100_000; h.x = 45; h.z = 35; h.homeSince = 0; io.to(c.key).emit('herd', true); }
    return;
  }
  let far: PlayerInfo | null = null, farD = 13;
  for (const p of c.players.values()) {
    if (p.st === 5 || c.queue.includes(p.id)) continue;
    const d = Math.hypot(p.x - GATHER.x, p.z - GATHER.z); if (d > farD) { farD = d; far = p; }
  }
  let gx = GATHER.x + 7, gz = GATHER.z + 3;
  if (far) { const k = 3.5 / farD; gx = far.x + (far.x - GATHER.x) * k; gz = far.z + (far.z - GATHER.z) * k; h.homeSince = 0; }
  else if (!h.homeSince) h.homeSince = now;
  const dx = gx - h.x, dz = gz - h.z, d = Math.hypot(dx, dz), step = Math.min(d, 1.3);
  if (d > 0.05) { h.x += (dx / d) * step; h.z += (dz / d) * step; h.ry = Math.atan2(dx, dz); }
  io.to(c.key).emit('dog', [+h.x.toFixed(2), +h.z.toFixed(2), +h.ry.toFixed(2)]);
  const allHome = !!h.homeSince && now - h.homeSince > 5000;
  if (allHome || now > h.until || c.players.size === 0) { h.on = false; h.next = nextHerd(); io.to(c.key).emit('herd', false, allHome); }
}

// 이동은 0.1초마다 묶어서 보낸다
setInterval(() => {
  const now = Date.now();
  for (const c of channels) {
    if (c.dirty.size) {
      const moves: Move[] = [];
      for (const id of c.dirty) { const p = c.players.get(id); if (p) moves.push([id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.st]); }
      c.dirty.clear(); io.to(c.key).emit('moves', moves);
    }
    herdTick(c, now);
  }
  for (const s of io.sockets.sockets.values()) (s as Sock).data.budget = Math.min(20, ((s as Sock).data.budget ?? 0) + 2);
}, 100);
// 줄 맨 앞에서 멈춰 있는 양 정리
setInterval(() => { const now = Date.now(); for (const c of channels) if (c.queue.length && now - c.frontSince > FRONT_TIMEOUT) setQueue(c, c.queue.slice(1)); }, 1000);

loadState<Saved>().then((saved) => {
  const old = saved as unknown as Partial<Totals>; // 예전 저장 형식: 수출액만 있던 때
  if (typeof old.money === 'number') Object.assign(S.totals, { money: old.money, kg: old.kg || 0, litres: old.litres || 0 });
  else Object.assign(S, saved, { totals: { ...S.totals, ...(saved.totals || {}) } });
  if (saved.vault === undefined) S.vault = S.totals.money; // 금고가 생기기 전에 번 돈도 금고에 넣어 준다
  http.listen(PORT, () => console.log(`Sheep'll Be Right server on :${PORT} (grow ${GROW_MS}ms, cap ${CAP}, store ${usingRedis ? 'redis' : 'file'})`));
});
