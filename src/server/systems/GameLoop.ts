/**
 * GameLoop: drives all Tetris instances. One tick per server tick.
 * For each active instance: consume input for that player, apply action, tick gravity, render if dirty.
 */

import type { World } from 'hytopia';
import { consumeInput } from './InputSystem.js';
import { getAllInstances } from '../game/InstanceRegistry.js';

/**
 * Run one tick: process input and gravity for every active instance, then render dirty instances.
 * Input routing: each player's actions apply only to their own instance.
 */
export function runTick(world: World, deltaMs: number): void {
  const instances = getAllInstances();

  for (const instance of instances) {
    const { action, softDropActive } = consumeInput(instance.playerId);
    instance.handleAction(action, softDropActive);
    instance.tick(deltaMs);
    instance.render(world);
  }
}
