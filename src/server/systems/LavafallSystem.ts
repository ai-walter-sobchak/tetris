/**
 * LavafallSystem: purely cosmetic vertical lava column behind the board.
 * No physics, no collisions, no game state. Deterministic, server-safe.
 */

import type { World } from 'hytopia';

export type LavafallConfig = {
  /** World position of top of lava column (ceiling). */
  origin: { x: number; y: number; z: number };
  /** Number of blocks vertically (14–18). */
  height: number;
  width: number;
  depth: number;
  /** Block type IDs for animation frames (length 4). */
  frames: number[];
  /** Ms between frame advances (110–140). */
  tickEveryMs: number;
  /** If true, place 2x2 glow pool at bottom. */
  poolGlow?: boolean;
};

export type LavafallState = {
  lastMs: number;
  frame: number;
};

/**
 * Create lavafall config. Placement must be behind board, not in playfield.
 */
export function createLavafall(config: LavafallConfig): LavafallConfig {
  return { ...config, poolGlow: config.poolGlow ?? false };
}

/**
 * Advance animation state and write lava blocks to world.
 * For each vertical position dy (0 = top), blockId = frames[(currentFrame + dy) % frames.length].
 */
export function tickLavafall(
  world: World,
  nowMs: number,
  state: LavafallState,
  config: LavafallConfig
): void {
  const { origin, height, width, depth, frames, tickEveryMs, poolGlow } = config;
  if (frames.length === 0) return;

  const elapsed = nowMs - state.lastMs;
  if (elapsed >= tickEveryMs) {
    state.frame = (state.frame + 1) % frames.length;
    state.lastMs = nowMs;
  }

  const currentFrame = state.frame;

  for (let dy = 0; dy < height; dy++) {
    const blockId = frames[(currentFrame + dy) % frames.length];
    const y = origin.y - dy;
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        world.chunkLattice.setBlock(
          { x: origin.x + dx, y, z: origin.z + dz },
          blockId
        );
      }
    }
  }

  if (poolGlow) {
    const poolY = origin.y - height;
    const poolBlockId = frames[0];
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        world.chunkLattice.setBlock(
          { x: origin.x + dx - 1, y: poolY, z: origin.z + dz - 1 },
          poolBlockId
        );
      }
    }
  }
}

/**
 * Draw animated lava on the board boundary (left, right, top, bottom edges).
 * zOffsets: which z layers to draw (default [0] = board plane only). Use e.g. [-2,-1,0,1] to match wall depth.
 * Uses same frame index so boundary and lavafall stay in sync. Purely cosmetic.
 */
export function tickBoundaryLava(
  world: World,
  frame: number,
  frames: number[],
  origin: { x: number; y: number; z: number },
  width: number,
  height: number,
  zOffsets: number[] = [0]
): void {
  if (frames.length === 0) return;

  for (const zOff of zOffsets) {
    const z = origin.z + zOff;
    for (let y = 0; y < height; y++) {
      const blockId = frames[(frame + y) % frames.length];
      world.chunkLattice.setBlock({ x: origin.x - 1, y: origin.y + y, z }, blockId);
      world.chunkLattice.setBlock({ x: origin.x + width, y: origin.y + y, z }, blockId);
    }
    for (let x = 0; x < width; x++) {
      const blockId = frames[(frame + x) % frames.length];
      world.chunkLattice.setBlock({ x: origin.x + x, y: origin.y - 1, z }, blockId);
      world.chunkLattice.setBlock({ x: origin.x + x, y: origin.y + height, z }, blockId);
    }
  }
}
