/**
 * HudService: sends HUD data to client UI (score, level, lines, status, optional leaderboard).
 */

import type { Player } from 'hytopia';
import type { TetrisState } from '../state/types.js';
import type { LeaderboardPayload } from '../schema/hudMessages.js';

export interface HudPayload {
  score: number;
  level: number;
  lines: number;
  status: string; // RUNNING | GAME_OVER
  gameStarted: boolean; // true once the round has begun (Start clicked)
  leaderboard?: LeaderboardPayload;
}

export function buildHudPayload(
  state: TetrisState,
  gameStarted: boolean,
  leaderboard?: LeaderboardPayload
): HudPayload {
  const payload: HudPayload = {
    score: state.score,
    level: state.level,
    lines: state.lines,
    status: state.gameStatus,
    gameStarted,
  };
  if (leaderboard) payload.leaderboard = leaderboard;
  return payload;
}

export function sendHudToPlayer(
  player: Player,
  state: TetrisState,
  gameStarted: boolean,
  leaderboard?: LeaderboardPayload
): void {
  player.ui.sendData(buildHudPayload(state, gameStarted, leaderboard));
}

/** Send only leaderboard payload (e.g. periodic broadcast or after score submit). */
export function sendLeaderboardToPlayer(player: Player, payload: LeaderboardPayload): void {
  player.ui.sendData({ leaderboard: payload });
}
