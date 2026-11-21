import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// 저장소: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 이 있으면 Upstash Redis(재배포해도 유지),
// 없으면 파일(server/data/state.json — Render 무료 디스크는 재배포 때 지워짐).
const URL_ = process.env.UPSTASH_REDIS_REST_URL, TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.STATE_KEY || 'sbr:state';
const DATA = new URL('../data/', import.meta.url), FILE = new URL('state.json', DATA);
export const usingRedis = !!(URL_ && TOKEN);

export async function loadState<T>(): Promise<Partial<T>> {
  try {
    if (usingRedis) {
      const r = await fetch(`${URL_}/get/${KEY}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const j = (await r.json()) as { result: string | null };
      return j.result ? JSON.parse(j.result) : {};
    }
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

let timer: NodeJS.Timeout | null = null, latest: unknown = null;
/** 자주 불러도 됨: Redis는 15초, 파일은 2초에 한 번만 실제로 쓴다 */
export function saveState(state: unknown) {
  latest = state;
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      if (usingRedis) await fetch(`${URL_}/set/${KEY}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(latest) });
      else { mkdirSync(DATA, { recursive: true }); writeFileSync(FILE, JSON.stringify(latest)); }
    } catch (e) { console.error('save failed', e); }
  }, usingRedis ? 15_000 : 2_000);
}
