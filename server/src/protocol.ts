// 서버와 클라이언트가 함께 쓰는 타입. 클라이언트는 `import type`으로만 가져간다.

/** 0 서 있음, 1 걷는 중, 4 구르는 중(털 가득), 5 털 깎이는 중 */
export type St = 0 | 1 | 4 | 5;
/** [id, x, z, ry, st] — 자주 오가므로 배열 */
export type Move = [string, number, number, number, St];
export type Emote = 'baa' | 'jump' | 'nuzzle';

export interface PlayerInfo { id: string; x: number; z: number; ry: number; st: St; /** 마지막으로 털 깎인 서버 시각(ms) */ woolAt: number }
export interface Totals { money: number; kg: number; litres: number }

export interface Welcome {
  id: string;
  /** 서버 시각 — 클라이언트 시계 보정용 */
  now: number;
  channel: number;
  players: PlayerInfo[];
  totals: Totals;
  woolAt: number;
  milkAt: number;
  /** 털 깎기 줄 (맨 앞이 지금 깎이는 양) */
  queue: string[];
  growMs: number;
  milkMs: number;
  online: number;
}
export type ShearResult = { ok: true; earned: number; at: number } | { ok: false; at: number };
export type MilkResult = { ok: true; earned: number; at: number } | { ok: false; at: number };
