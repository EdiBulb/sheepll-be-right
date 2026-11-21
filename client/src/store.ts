// 이 브라우저에만 저장되는 내 기록: 내 기여, 방문한 날, 모은 소품, 설정.
// 다른 사람과 비교하지 않는 '나만의 기록'이다 (순위 없음).

export interface Store {
  shears: number;      // 털 깎인 횟수
  cleanBlows: number;  // 6번 안에 깔끔하게 깎은 횟수
  kg: number;          // 내가 보탠 양털
  milks: number;       // 우유 짠 횟수
  litres: number;
  earned: number;      // 내가 보탠 수출액(NZ$)
  emotes: number;
  firstVisit: string;  // YYYY-MM-DD (뉴질랜드 날짜)
  days: string[];      // 들어온 날 (최근 60일)
  wearing: string;     // 지금 쓰고 있는 소품 id ('' = 없음)
  soundOn: boolean;
}

const KEY = 'sheep-store';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());

function load(): Store {
  const base: Store = { shears: 0, cleanBlows: 0, kg: 0, milks: 0, litres: 0, earned: 0, emotes: 0, firstVisit: today(), days: [], wearing: '', soundOn: true };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return base; }
}
export const store = load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* 저장 안 돼도 게임은 계속 */ } }

/** 오늘 방문 기록. 오늘 처음이면 true */
export function markVisit() {
  const d = today();
  if (store.days.includes(d)) return false;
  store.days = [...store.days, d].slice(-60); save();
  return true;
}
