// 서버와 클라이언트가 함께 쓰는 타입. 클라이언트는 `import type`으로만 가져간다.

/** 0 서 있음, 1 걷는 중, 2 풀 뜯는 중, 3 누워 쉬는 중, 4 구르는 중(털 가득), 5 털 깎이는 중 */
export type St = 0 | 1 | 2 | 3 | 4 | 5;
/** [id, x, z, ry, st] — 자주 오가므로 배열 */
export type Move = [string, number, number, number, St];
export type Emote = 'baa' | 'jump' | 'nuzzle';

export interface PlayerInfo {
  id: string; x: number; z: number; ry: number; st: St;
  /** 마지막으로 털 깎인 서버 시각(ms) */ woolAt: number;
  /** 머리 소품 id ('' = 없음) */ acc: string;
  /** 초대 링크로 묶인 친구 코드 ('' = 없음) */ party: string;
}
export interface Totals { money: number; kg: number; litres: number }
/** 모두가 함께 쓰는 목장 금고와 투표 */
export interface GameState {
  /** 금고: 번 돈이 쌓이고, 무언가 지으면 줄어든다 (누적 수출액 totals.money는 줄지 않음) */
  vault: number;
  built: string[];
  vote: { open: boolean; options: string[]; counts: Record<string, number> };
}

export interface Welcome {
  id: string;
  /** 서버 시각 — 클라이언트 시계 보정용 */
  now: number;
  farm: string;
  channel: number;
  players: PlayerInfo[];
  totals: Totals;
  state: GameState;
  woolAt: number;
  milkAt: number;
  /** 털 깎기 줄 (맨 앞이 지금 깎이는 양) */
  queue: string[];
  growMs: number;
  milkMs: number;
  online: number;
  /** 양몰이 중인지 */
  herd: boolean;
  /** 오늘 이미 투표했는지 */
  voted: boolean;
}
export type ShearResult = { ok: true; earned: number; happy: number; at: number } | { ok: false; at: number };
export type MilkResult = { ok: true; earned: number; at: number } | { ok: false; at: number };
export type VoteResult = { ok: boolean; why?: 'closed' | 'already' };
