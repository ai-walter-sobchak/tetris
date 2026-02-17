/**
 * CommandService: parses chat commands for debug (e.g. /reset, /speed, /fillrow, /spawn).
 */

import type { TetrisState } from '../state/types.js';
import { resetState } from '../state/WorldState.js';
import { forceNextPiece, fillRow } from '../systems/TetrisSystem.js';
import { GRAVITY_MIN_MS, GRAVITY_BASE_MS } from '../config/tetris.js';
import { clampGravityMs } from '../util/time.js';
import type { PieceTypeId } from '../state/types.js';

export type CommandResult = { handled: boolean; message?: string };

const PIECE_NAMES: Record<string, PieceTypeId> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
  i: 1, o: 2, t: 3, s: 4, z: 5, j: 6, l: 7,
};

/**
 * Parse chat message and apply debug command if applicable.
 * Returns { handled, message } for optional reply to player.
 */
export function handleCommand(
  text: string,
  state: TetrisState
): CommandResult {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { handled: false };

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case 'reset': {
      resetState(state);
      return { handled: true, message: 'Game reset.' };
    }
    case 'speed': {
      const ms = parseInt(parts[1], 10);
      if (Number.isNaN(ms) || ms < 0) {
        return { handled: true, message: 'Usage: /speed <ms>. Example: /speed 200' };
      }
      state.gravityIntervalMs = clampGravityMs(ms, GRAVITY_MIN_MS, GRAVITY_BASE_MS);
      return { handled: true, message: `Gravity interval set to ${state.gravityIntervalMs}ms` };
    }
    case 'fillrow': {
      const y = parseInt(parts[1], 10);
      if (Number.isNaN(y) || y < 0 || y > 19) {
        return { handled: true, message: 'Usage: /fillrow <y> (0-19)' };
      }
      fillRow(state, y);
      return { handled: true, message: `Row ${y} filled.` };
    }
    case 'spawn': {
      const name = parts[1];
      const type = name != null ? PIECE_NAMES[name] : undefined;
      if (type == null) {
        return { handled: true, message: 'Usage: /spawn <I|O|T|S|Z|J|L>' };
      }
      forceNextPiece(state, type);
      return { handled: true, message: `Next piece set to ${name.toUpperCase()}.` };
    }
    default:
      return { handled: false };
  }
}
