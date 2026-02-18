/**
 * InstanceRegistry: maps playerId -> GameInstance. Used by GameLoop and HudService to route tick/HUD.
 */

import type { GameInstance } from './GameInstance.js';
import type { Plot } from '../plots/PlotManager.js';

const playerToInstance = new Map<string, GameInstance>();

export function registerInstance(playerId: string, instance: GameInstance): void {
  playerToInstance.set(playerId, instance);
}

export function unregisterInstance(playerId: string): void {
  playerToInstance.delete(playerId);
}

export function getInstanceByPlayer(playerId: string): GameInstance | undefined {
  return playerToInstance.get(playerId);
}

/** All active instances (for tick loop). */
export function getAllInstances(): GameInstance[] {
  return [...playerToInstance.values()];
}

export function hasInstance(playerId: string): boolean {
  return playerToInstance.has(playerId);
}
