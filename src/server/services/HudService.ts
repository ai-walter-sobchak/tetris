/**
 * HudService: sends HUD data to client UI (score, level, lines, status).
 */

import type { Player } from 'hytopia';
import type { TetrisState } from '../state/types.js';

export interface HudPayload {
  score: number;
  level: number;
  lines: number;
  status: string; // RUNNING | GAME_OVER
  gameStarted: boolean; // true once the round has begun (Start clicked)
}

export function buildHudPayload(state: TetrisState, gameStarted: boolean): HudPayload {
  return {
    score: state.score,
    level: state.level,
    lines: state.lines,
    status: state.gameStatus,
    gameStarted,
  };
}

export function sendHudToPlayer(player: Player, state: TetrisState, gameStarted: boolean): void {
  player.ui.sendData(buildHudPayload(state, gameStarted));
}
