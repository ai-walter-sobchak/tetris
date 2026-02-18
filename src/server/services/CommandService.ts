/**
 * CommandService: parses chat commands. Per-player: /reset, /speed, etc. apply only to your instance.
 * /myplot, /plots for plot info.
 */

import { getInstanceByPlayer } from '../game/InstanceRegistry.js';
import { getPlotByPlayer, getAllPlots } from '../plots/PlotManager.js';
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
 * Parse chat message and apply command. Routing: state-changing commands use this player's instance only.
 */
export function handleCommand(playerId: string, text: string): CommandResult {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { handled: false };

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case 'myplot': {
      const plot = getPlotByPlayer(playerId);
      if (!plot) return { handled: true, message: 'You have no plot assigned.' };
      return { handled: true, message: `Your plot: ${plot.id} at (${plot.origin.x},${plot.origin.y},${plot.origin.z}).` };
    }
    case 'plots': {
      const plots = getAllPlots();
      const lines = plots.map((p) => `${p.id}: ${p.assignedPlayerId ?? 'free'}`);
      return { handled: true, message: lines.join(' | ') };
    }
    case 'reset': {
      const instance = getInstanceByPlayer(playerId);
      if (!instance) return { handled: true, message: 'You have no active game. Get a plot first.' };
      instance.reset();
      return { handled: true, message: 'Game reset.' };
    }
    case 'speed': {
      const instance = getInstanceByPlayer(playerId);
      if (!instance) return { handled: true, message: 'You have no active game.' };
      const ms = parseInt(parts[1], 10);
      if (Number.isNaN(ms) || ms < 0) {
        return { handled: true, message: 'Usage: /speed <ms>. Example: /speed 200' };
      }
      instance.state.gravityIntervalMs = clampGravityMs(ms, GRAVITY_MIN_MS, GRAVITY_BASE_MS);
      return { handled: true, message: `Gravity interval set to ${instance.state.gravityIntervalMs}ms` };
    }
    case 'fillrow': {
      const instance = getInstanceByPlayer(playerId);
      if (!instance) return { handled: true, message: 'You have no active game.' };
      const y = parseInt(parts[1], 10);
      if (Number.isNaN(y) || y < 0 || y > 19) {
        return { handled: true, message: 'Usage: /fillrow <y> (0-19)' };
      }
      fillRow(instance.state, y);
      return { handled: true, message: `Row ${y} filled.` };
    }
    case 'spawn': {
      const instance = getInstanceByPlayer(playerId);
      if (!instance) return { handled: true, message: 'You have no active game.' };
      const name = parts[1];
      const type = name != null ? PIECE_NAMES[name] : undefined;
      if (type == null) {
        return { handled: true, message: 'Usage: /spawn <I|O|T|S|Z|J|L>' };
      }
      forceNextPiece(instance.state, type);
      return { handled: true, message: `Next piece set to ${name.toUpperCase()}.` };
    }
    default:
      return { handled: false };
  }
}
