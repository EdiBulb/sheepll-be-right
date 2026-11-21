// 서버와 클라이언트가 함께 쓰는 값 (클라이언트도 이 파일을 그대로 import 한다)

/** 돌아다닐 수 있는 목장 반지름(m)과 북쪽 바닷가 */
export const WORLD_R = 78;
export const SHORE_Z = -63;
/** 양치기 개가 양들을 모으는 곳 (털 깎는 헛간 앞마당) */
export const GATHER = { x: 2, z: 7 };

export interface Farm { id: string; name: string; lon: number; lat: number }
/** 농장(도시) 목록. auckland는 처음부터 있고 나머지는 투표로 지어진다 */
export const FARMS: Farm[] = [
  { id: 'auckland', name: 'Auckland', lon: 174.76, lat: -36.85 },
  { id: 'hamilton', name: 'Hamilton', lon: 175.28, lat: -37.79 },
  { id: 'tauranga', name: 'Tauranga', lon: 176.17, lat: -37.69 },
  { id: 'wellington', name: 'Wellington', lon: 174.78, lat: -41.29 },
  { id: 'christchurch', name: 'Christchurch', lon: 172.64, lat: -43.53 },
  { id: 'queenstown', name: 'Queenstown', lon: 168.66, lat: -45.03 },
];

export interface CatalogItem { id: string; kind: 'building' | 'farm'; name: string; price: number; blurb: string }
/** 목장 금고로 지을 수 있는 것들 (싼 순서). 투표 후보는 아직 안 지은 것 중 앞에서 3개 */
export const CATALOG: CatalogItem[] = [
  { id: 'tree', kind: 'building', name: 'Big shade tree', price: 5_000, blurb: 'A shady spot by the yard to nap together' },
  { id: 'hay', kind: 'building', name: 'Hay bale picnic', price: 8_000, blurb: 'A ring of hay bales to hang out on' },
  { id: 'lighthouse', kind: 'building', name: 'Lighthouse', price: 15_000, blurb: 'Guides the wool ships into port' },
  { id: 'windmill', kind: 'building', name: 'Windmill', price: 20_000, blurb: 'Turns slowly on the eastern hill' },
  { id: 'hamilton', kind: 'farm', name: 'Hamilton farm', price: 100_000, blurb: 'A golden Waikato farm to roam' },
  { id: 'christchurch', kind: 'farm', name: 'Christchurch farm', price: 100_000, blurb: 'Canterbury plains under the Alps' },
  { id: 'queenstown', kind: 'farm', name: 'Queenstown farm', price: 100_000, blurb: 'High country among the mountains' },
  { id: 'wellington', kind: 'farm', name: 'Wellington farm', price: 100_000, blurb: 'A breezy farm by the capital' },
  { id: 'tauranga', kind: 'farm', name: 'Tauranga farm', price: 100_000, blurb: 'Sunny Bay of Plenty pastures' },
];

/** 뉴질랜드 날짜(YYYY-MM-DD)와 시(0~23) */
export function nzNow(d = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(d);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', hour12: false }).format(d)) % 24;
  return { day, hour };
}
