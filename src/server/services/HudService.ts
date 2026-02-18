/**
 * HudService: sends HUD data to client UI (score, level, lines, status, optional leaderboard).
 * Multi-player: each player receives HUD from their own plot instance; no instance = idle/assigning message.
 */

import type { Player } from 'hytopia';
import type { TetrisState } from '../state/types.js';
import type { LeaderboardPayload } from '../schema/hudMessages.js';
import { getInstanceByPlayer } from '../game/InstanceRegistry.js';

export interface HudPayload {
  score: number;
  level: number;
  lines: number;
  status: string; // RUNNING | GAME_OVER | ASSIGNING_PLOT | NO_PLOT
  gameStarted: boolean;
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

/** Idle payload when player has no plot (assigning or all full). */
function idleHudPayload(leaderboard?: LeaderboardPayload, noPlot?: boolean): HudPayload {
  const payload: HudPayload = {
    score: 0,
    level: 1,
    lines: 0,
    status: noPlot ? 'NO_PLOT' : 'ASSIGNING_PLOT',
    gameStarted: false,
  };
  if (leaderboard) payload.leaderboard = leaderboard;
  return payload;
}

/**
 * Send HUD to this player. Routing: payload comes from their plot instance.
 * If no instance, sends idle state (ASSIGNING_PLOT or NO_PLOT when all plots full).
 */
export function sendHudToPlayer(
  player: Player,
  leaderboard?: LeaderboardPayload,
  noPlot?: boolean
): void {
  const instance = getInstanceByPlayer(player.id);
  const payload = instance
    ? instance.getHudPayload(leaderboard)
    : idleHudPayload(leaderboard, noPlot);
  player.ui.sendData(payload);
}

/** Send only leaderboard payload (e.g. periodic broadcast or after score submit). */
export function sendLeaderboardToPlayer(player: Player, payload: LeaderboardPayload): void {
  player.ui.sendData({ leaderboard: payload });
}
