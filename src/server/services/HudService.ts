/**
 * HudService: sends HUD data to client UI (score, level, lines, next piece, status).
 */

import type { Player } from 'hytopia';
import type { TetrisState } from '../state/types.js';

export interface HudPayload {
  score: number;
  level: number;
  lines: number;
  next: number; // piece type id 1..7
  status: string; // RUNNING | GAME_OVER
}

export function buildHudPayload(state: TetrisState): HudPayload {
  return {
    score: state.score,
    level: state.level,
    lines: state.lines,
    next: state.nextPiece?.type ?? 0,
    status: state.gameStatus,
  };
}

export function sendHudToPlayer(player: Player, state: TetrisState): void {
  player.ui.sendData(buildHudPayload(state));
}
