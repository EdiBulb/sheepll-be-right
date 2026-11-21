import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Server, type Socket } from 'socket.io';
import type { Emote, MilkResult, Move, PlayerInfo, ShearResult, St, Totals, Welcome } from './protocol';

const PORT = Number(process.env.PORT || 3001);
const ORIGIN = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : '*';
const GROW_MS = Number(process.env.GROW_MS || 10 * 60_000); // 털이 다 자라는 시간
const MILK_MS = Number(process.env.MILK_MS || 3 * 60_000);
const CAP = Number(process.env.CHANNEL_CAP || 30);         // 농장(채널)당 양 수
const SHEAR_PRICE = 150, SHEAR_KG = 4.5, CLEAN_BONUS = 30, MILK_PRICE = 30, MILK_L = 0.5;
const FRONT_TIMEOUT = 60_000;                               // 맨 앞에서 너무 오래 있으면 줄에서 뺌
const WORLD_R = 16;

// ── 누적 수출액 (지금은 파일 저장. Render 무료 디스크는 재배포 때 지워지므로 출시 전 Redis로 옮길 것)
const DATA = new URL('../data/', import.meta.url);
const FILE = new URL('state.json', DATA);
let totals: Totals = { money: 0, kg: 0, litres: 0 };
try { totals = { ...totals, ...JSON.parse(readFileSync(FILE, 'utf8')) }; } catch { /* 첫 실행 */ }
let saveTimer: NodeJS.Timeout | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { mkdirSync(DATA, { recursive: true }); writeFileSync(FILE, JSON.stringify(totals)); } catch (e) { console.error('save failed', e); } }, 2000);
}

interface Channel { n: number; key: string; players: Map<string, PlayerInfo>; dirty: Set<string>; queue: string[]; frontSince: number }
const channels: Channel[] = [];
function pickChannel(): Channel {
  let c = channels.find((x) => x.players.size < CAP);
  if (!c) { const n = channels.length + 1; c = { n, key: `c${n}`, players: new Map(), dirty: new Set(), queue: [], frontSince: 0 }; channels.push(c); }
  return c;
}
/** uid → 마지막 털 깎인 시각 / 우유 짠 시각. 모르는 uid는 털·우유가 가득 찬 상태로 시작 */
const woolAt = new Map<string, number>(), milkAt = new Map<string, number>();

const ACCS = ['daisy', 'bow', 'scarf', 'crown', 'beanie'];
const cleanAcc = (v: unknown) => (typeof v === 'string' && ACCS.includes(v) ? v : '');

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

  s.on('join', (p: { uid?: string; acc?: string }) => {
    leave(s);
    const now = Date.now();
    s.data.uid = typeof p?.uid === 'string' && p.uid ? p.uid.slice(0, 40) : s.id;
    const c = pickChannel(); s.data.channel = c;
    const wa = woolAt.get(s.data.uid) ?? now - GROW_MS, ma = milkAt.get(s.data.uid) ?? now - MILK_MS;
    const a = Math.random() * Math.PI * 2;
    const me: PlayerInfo = { id: s.id, x: 3 + Math.cos(a) * 2, z: 6 + Math.sin(a) * 2, ry: Math.PI, st: 0, woolAt: wa, acc: cleanAcc(p?.acc) };
    const w: Welcome = { id: s.id, now, channel: c.n, players: [...c.players.values()], totals, woolAt: wa, milkAt: ma, queue: c.queue, growMs: GROW_MS, milkMs: MILK_MS, online: online() };
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
    me.x = x * k; me.z = z * k; me.ry = ry; me.st = ([0, 1, 4, 5].includes(st) ? st : 0) as St;
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

  s.on('shear', (p: { clean?: boolean }, ack?: (r: ShearResult) => void) => {
    const c = s.data.channel, me = c?.players.get(s.id), now = Date.now();
    if (!c || !me) return;
    const last = woolAt.get(s.data.uid) ?? now - GROW_MS;
    const wool = Math.min(1, (now - last) / GROW_MS);
    if (c.queue[0] !== s.id || wool < 0.2) { ack?.({ ok: false, at: last }); return; }
    const ratio = Math.min(1, wool / 0.85);
    const earned = Math.round(SHEAR_PRICE * ratio) + (p?.clean ? CLEAN_BONUS : 0);
    totals.money += earned; totals.kg = Math.round((totals.kg + SHEAR_KG * ratio) * 10) / 10; save();
    woolAt.set(s.data.uid, now); me.woolAt = now;
    setQueue(c, c.queue.slice(1));
    ack?.({ ok: true, earned, at: now });
    s.to(c.key).emit('sheared', s.id, now); io.emit('totals', totals);
  });

  s.on('milk', (ack?: (r: MilkResult) => void) => {
    const now = Date.now(), last = milkAt.get(s.data.uid) ?? now - MILK_MS;
    if (!s.data.channel || now - last < MILK_MS) { ack?.({ ok: false, at: last }); return; }
    totals.money += MILK_PRICE; totals.litres = Math.round((totals.litres + MILK_L) * 10) / 10; save();
    milkAt.set(s.data.uid, now);
    ack?.({ ok: true, earned: MILK_PRICE, at: now }); io.emit('totals', totals);
  });

  s.on('disconnect', () => { leave(s); io.emit('online', online()); });
});

// 이동은 0.1초마다 묶어서 보낸다
setInterval(() => {
  for (const c of channels) {
    if (c.dirty.size) {
      const moves: Move[] = [];
      for (const id of c.dirty) { const p = c.players.get(id); if (p) moves.push([id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.st]); }
      c.dirty.clear(); io.to(c.key).emit('moves', moves);
    }
  }
  for (const s of io.sockets.sockets.values()) (s as Sock).data.budget = Math.min(20, ((s as Sock).data.budget ?? 0) + 2);
}, 100);
// 줄 맨 앞에서 멈춰 있는 양 정리
setInterval(() => { const now = Date.now(); for (const c of channels) if (c.queue.length && now - c.frontSince > FRONT_TIMEOUT) setQueue(c, c.queue.slice(1)); }, 1000);

http.listen(PORT, () => console.log(`Sheep'll Be Right server on :${PORT} (grow ${GROW_MS}ms, cap ${CAP})`));
