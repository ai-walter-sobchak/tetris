/**
 * RenderSystem: syncs Tetris state to world blocks.
 * Maps board grid + active piece to chunkLattice blocks; incremental updates when possible.
 */

import type { World } from 'hytopia';
import { BOARD_ORIGIN, BOARD_WIDTH, BOARD_HEIGHT, BOARD_WALL_BLOCK_ID } from '../config/tetris.js';
import { PIECE_TYPE_TO_BLOCK_ID } from '../config/tetris.js';
import type { TetrisState } from '../state/types.js';
import { getPieceCells } from './TetrisSystem.js';

/** Cell key "x,y" for tracking. */
function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Last rendered state: which cells had which block id (so we can clear/set only diffs). */
let lastRendered: Map<string, number> = new Map();

/**
 * Compute desired block id at grid (x,y): 0 = air, 1..7 = piece type.
 */
function getDesiredCell(state: TetrisState, x: number, y: number): number {
  // Active piece
  if (state.activePiece) {
    const cells = getPieceCells(state.activePiece);
    for (const c of cells) {
      if (c.x === x && c.y === y) return state.activePiece.type;
    }
  }
  // Board
  if (y >= 0 && y < state.board.length && x >= 0 && x < state.board[0].length) {
    return state.board[y][x];
  }
  return 0;
}

/**
 * Grid to world position. Board is in X (columns) and Y (rows); Z fixed for a flat vertical board.
 */
function gridToWorld(gx: number, gy: number): { x: number; y: number; z: number } {
  return {
    x: BOARD_ORIGIN.x + gx,
    y: BOARD_ORIGIN.y + gy,
    z: BOARD_ORIGIN.z,
  };
}

/**
 * Render full board + active piece to world blocks.
 * Uses incremental update: only setBlock where value changed; clear others to 0 (air).
 */
export function render(state: TetrisState, world: World): void {
  const desired = new Map<string, number>();
  const width = state.board[0].length;
  const height = state.board.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = getDesiredCell(state, x, y);
      const blockId = id === 0 ? 0 : PIECE_TYPE_TO_BLOCK_ID[id] ?? 0;
      desired.set(cellKey(x, y), blockId);
    }
  }

  // Board boundary: left wall, right wall, bottom, and top so the play area is visible.
  const wall = BOARD_WALL_BLOCK_ID;
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    desired.set(cellKey(-1, y), wall);
    desired.set(cellKey(BOARD_WIDTH, y), wall);
  }
  for (let x = 0; x < BOARD_WIDTH; x++) {
    desired.set(cellKey(x, -1), wall);
    desired.set(cellKey(x, BOARD_HEIGHT), wall);
  }

  // Apply diffs: clear or set only changed cells
  const allKeys = new Set([...lastRendered.keys(), ...desired.keys()]);
  for (const key of allKeys) {
    const [x, y] = key.split(',').map(Number);
    const prev = lastRendered.get(key);
    const next = desired.get(key) ?? 0;
    if (prev !== next) {
      const pos = gridToWorld(x, y);
      world.chunkLattice.setBlock(pos, next);
    }
  }

  lastRendered = desired;
}

/** Call when state is reset (e.g. new game) so we don't leave stale blocks. */
export function clearRenderCache(): void {
  lastRendered = new Map();
}
