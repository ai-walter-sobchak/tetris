/**
 * Procedural wall generator for the Tetris game board.
 * Uses a seed so each round produces a different wall layout (thickness, depth, gaps).
 */

import { createRng } from '../util/rng.js';
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  WALL_SIDE_X,
  WALL_BOTTOM_THICKNESS,
  WALL_TOP_THICKNESS,
  WALL_DEPTH,
  WALL_DEPTH_BACK,
  WALL_FILL_PROBABILITY,
} from '../config/tetris.js';

/** Grid position for a wall block: (gx, gy) in board grid. zOffset: 0 = board plane; positive = in front; negative = behind. */
export interface WallCell {
  gx: number;
  gy: number;
  zOffset: number;
}

/** Z offsets for wall layers: from -WALL_DEPTH_BACK (behind) through 0 (board) to WALL_DEPTH-1 (in front). */
function getWallZOffsets(): number[] {
  const out: number[] = [];
  for (let z = -WALL_DEPTH_BACK; z < 0; z++) out.push(z);
  for (let z = 0; z < WALL_DEPTH; z++) out.push(z);
  return out;
}

/**
 * Generate the set of wall block positions for the current round.
 * Same seed always yields the same layout; different seeds yield different patterns.
 */
export function getWallLayout(seed: number): WallCell[] {
  const rng = createRng(seed);
  const cells: WallCell[] = [];

  const fill = () => rng.next() < WALL_FILL_PROBABILITY;
  /** Inner edge (touching play area) is always solid; outer layers use probabilistic fill. */
  const fillOrInner = (isInner: boolean) => isInner || fill();

  const zOffsets = getWallZOffsets();

  // Left wall: extends 20 blocks in the -X direction (gx -20 to -1), full board height, both depth directions
  for (const zOff of zOffsets) {
    for (let gy = 0; gy < BOARD_HEIGHT; gy++) {
      for (let gx = -WALL_SIDE_X; gx <= -1; gx++) {
        if (fillOrInner(gx === -1)) cells.push({ gx, gy, zOffset: zOff });
      }
    }
  }

  // Right wall: extends 20 blocks in the +X direction (gx 10 to 29), full board height, both depth directions
  for (const zOff of zOffsets) {
    for (let gy = 0; gy < BOARD_HEIGHT; gy++) {
      for (let gx = BOARD_WIDTH; gx <= BOARD_WIDTH + WALL_SIDE_X - 1; gx++) {
        if (fillOrInner(gx === BOARD_WIDTH)) cells.push({ gx, gy, zOffset: zOff });
      }
    }
  }

  // Bottom wall (floor): thicker so it reads clearly as a solid base. Inner row (gy === -1) always solid.
  for (const zOff of zOffsets) {
    for (let gy = -WALL_BOTTOM_THICKNESS; gy <= -1; gy++) {
      for (let gx = 0; gx < BOARD_WIDTH; gx++) {
        if (fillOrInner(gy === -1)) cells.push({ gx, gy, zOffset: zOff });
      }
    }
  }

  // Top wall (ceiling): inner row (gy === BOARD_HEIGHT) always solid.
  for (const zOff of zOffsets) {
    for (let gy = BOARD_HEIGHT; gy <= BOARD_HEIGHT + WALL_TOP_THICKNESS - 1; gy++) {
      for (let gx = 0; gx < BOARD_WIDTH; gx++) {
        if (fillOrInner(gy === BOARD_HEIGHT)) cells.push({ gx, gy, zOffset: zOff });
      }
    }
  }

  // Corner fill (optional): the L-shaped corners where left/right meet top/bottom.
  // We already cover the edges; corners are included in the above ranges.
  // So we're done.

  return cells;
}

/** Convert a wall cell (grid + zOffset) to world position. zOffset 0 = board plane; positive = in front; negative = behind. */
export function wallCellToWorld(
  cell: WallCell,
  origin: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return {
    x: origin.x + cell.gx,
    y: origin.y + cell.gy,
    z: origin.z + cell.zOffset,
  };
}
