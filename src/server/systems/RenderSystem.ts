/**
 * RenderSystem: syncs Tetris state to world blocks.
 * Maps board grid + active piece to chunkLattice blocks; incremental updates when possible.
 */

import type { World } from 'hytopia';
import { BOARD_ORIGIN, BOARD_WIDTH, BOARD_HEIGHT, BOARD_WALL_BLOCK_ID } from '../config/tetris.js';
import { PIECE_TYPE_TO_BLOCK_ID } from '../config/tetris.js';
import type { TetrisState } from '../state/types.js';
import { getPieceCells } from './TetrisSystem.js';

/** When true, every tick does a full redraw (no diff). Safer if engine batches setBlock. */
export const RENDER_FULL_REDRAW_EVERY_TICK = true;

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
  // Active piece (use 1..7 for block id; 0 would render as air)
  if (state.activePiece) {
    const cells = getPieceCells(state.activePiece);
    const type = state.activePiece.type;
    const safeType = type >= 1 && type <= 7 ? type : 1;
    for (const c of cells) {
      if (c.x === x && c.y === y) return safeType;
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

/** Valid block IDs we may write (0 = air; others from config). */
const VALID_BLOCK_IDS = new Set([0, 1, 2, 3, 4, 5, 6, 7, BOARD_WALL_BLOCK_ID]);

/**
 * Render full board + active piece to world blocks.
 * Uses incremental update: only setBlock where value changed; clear others to 0 (air).
 * When RENDER_FULL_REDRAW_EVERY_TICK is true, writes every cell each tick (robust if engine batches).
 */
export function render(state: TetrisState, world: World): void {
  // Guard: avoid throw on malformed board and prevent silent wrong state
  if (!state.board?.length || !state.board[0]) return;
  if (state.board.length !== BOARD_HEIGHT || state.board[0].length !== BOARD_WIDTH) return;

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

  const doFullRedraw = RENDER_FULL_REDRAW_EVERY_TICK || lastRendered.size === 0;
  const keysToApply = doFullRedraw ? desired.keys() : new Set([...lastRendered.keys(), ...desired.keys()]);

  for (const key of keysToApply) {
    const next = desired.get(key) ?? 0;
    const prev = lastRendered.get(key);
    if (doFullRedraw || prev !== next) {
      if (!VALID_BLOCK_IDS.has(next)) continue; // guard: never write invalid block id
      const [x, y] = key.split(',').map(Number);
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
