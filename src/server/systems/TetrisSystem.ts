/**
 * TetrisSystem: server-authoritative game logic.
 * Handles piece shapes, collision, movement, rotation (with wall kick), lock, line clear, scoring.
 * No rendering; no I/O. Pure state transitions.
 */

import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  GRAVITY_BASE_MS,
  GRAVITY_DECREASE_PER_LEVEL_MS,
  GRAVITY_MIN_MS,
  SOFT_DROP_INTERVAL_MS,
  LINES_PER_LEVEL,
  SCORE_PER_LINES,
  WALL_KICK_OFFSETS,
  SPAWN_X,
  SPAWN_Y,
} from '../config/tetris.js';
import type { BoardGrid, CellValue, PieceState, TetrisState } from '../state/types.js';
import type { PieceTypeId } from '../state/types.js';
import { spawnNextPiece, createNextPiece } from '../state/WorldState.js';
import { clampGravityMs } from '../util/time.js';

// --- Piece definitions (4x4 grid per rotation; 1 = filled). Standard SRS-style. ---
// Each shape is [rotation][localY][localX]. Origin is top-left of 4x4 for placement.
type ShapeCell = 0 | 1;
type Shape4x4 = ShapeCell[][];

const SHAPES: Record<PieceTypeId, Shape4x4[]> = {
  1: [
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
  ],
  2: [
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  ],
  3: [
    [[0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
  ],
  4: [
    [[0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0]],
    [[1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
  ],
  5: [
    [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
  ],
  6: [
    [[1, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
  ],
  7: [
    [[0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 0], [1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
  ],
};

/** Get world (board) cell coordinates occupied by the piece (without checking bounds). */
export function getPieceCells(piece: PieceState): Array<{ x: number; y: number }> {
  const type = (piece.type >= 1 && piece.type <= 7 ? piece.type : 1) as PieceTypeId;
  const rotations = SHAPES[type];
  if (!rotations) return [];
  const shape = rotations[piece.rotation % 4];
  if (!shape) return [];
  const cells: Array<{ x: number; y: number }> = [];
  for (let ly = 0; ly < 4; ly++) {
    for (let lx = 0; lx < 4; lx++) {
      if (shape[ly][lx]) cells.push({ x: piece.x + lx, y: piece.y + ly });
    }
  }
  return cells;
}

/** Check if any of the piece's cells are out of bounds or overlap a filled board cell. */
export function collides(board: BoardGrid, piece: PieceState): boolean {
  const cells = getPieceCells(piece);
  for (const { x, y } of cells) {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return true;
    if (board[y][x] !== 0) return true;
  }
  return false;
}

/** Try to move piece by (dx, dy). Returns true if move was applied. */
export function tryMove(state: TetrisState, dx: number, dy: number): boolean {
  const p = state.activePiece;
  if (!p || state.gameStatus !== 'RUNNING') return false;
  const moved: PieceState = { ...p, x: p.x + dx, y: p.y + dy };
  if (collides(state.board, moved)) return false;
  state.activePiece = moved;
  return true;
}

/**
 * Rotation: try rotation in place, then wall-kick offsets in order (SRS-style).
 * Rotation is clockwise (rotation index 0→1→2→3). If rotation in place collides,
 * we try shifting the piece by each offset in WALL_KICK_OFFSETS until valid or none work.
 */
export function tryRotate(state: TetrisState): boolean {
  const p = state.activePiece;
  if (!p || state.gameStatus !== 'RUNNING') return false;
  const nextRotation = (p.rotation + 1) % 4;
  for (const [dx, dy] of WALL_KICK_OFFSETS) {
    const kicked: PieceState = { ...p, rotation: nextRotation, x: p.x + dx, y: p.y + dy };
    if (!collides(state.board, kicked)) {
      state.activePiece = kicked;
      return true;
    }
  }
  return false;
}

/** Soft drop: move down by one. Returns true if moved. */
export function softDrop(state: TetrisState): boolean {
  return tryMove(state, 0, -1);
}

/**
 * Hard drop: move piece down until it hits something, then lock.
 * Returns the final y delta (rows dropped) for potential future scoring bonus.
 */
export function hardDrop(state: TetrisState, rng: () => number): number {
  const p = state.activePiece;
  if (!p || state.gameStatus !== 'RUNNING') return 0;
  let dy = 0;
  while (tryMove(state, 0, -1)) dy++;
  lockPiece(state, rng);
  return dy;
}

/**
 * Merge piece into board and clear full lines. Call after lock.
 * Line clear: identify full rows, remove them (splice), then push empty rows on top
 * so the grid stays BOARD_HEIGHT rows and everything above drops down.
 */
function mergeAndClearLines(state: TetrisState): number {
  const p = state.activePiece;
  if (!p) return 0;

  const cells = getPieceCells(p);
  for (const { x, y } of cells) {
    if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      state.board[y][x] = p.type as CellValue;
    }
  }
  state.activePiece = null;

  const fullRows: number[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    if (state.board[y].every(c => c !== 0)) fullRows.push(y);
  }
  state.lastLinesCleared = fullRows.length;

  if (fullRows.length === 0) return 0;

  // Remove rows from highest index first so splice doesn't shift indices we still need to remove
  fullRows.sort((a, b) => b - a);
  for (const row of fullRows) {
    state.board.splice(row, 1);
    state.board.push(Array(BOARD_WIDTH).fill(0));
  }
  while (state.board.length < BOARD_HEIGHT) {
    state.board.push(Array(BOARD_WIDTH).fill(0));
  }

  // Scoring
  const points = SCORE_PER_LINES[fullRows.length] ?? 0;
  state.score += points;
  state.lines += fullRows.length;
  const levelBefore = state.level;
  state.level = Math.floor(state.lines / LINES_PER_LEVEL) + 1;
  if (state.level > levelBefore) {
    state.gravityIntervalMs = clampGravityMs(
      GRAVITY_BASE_MS - state.level * GRAVITY_DECREASE_PER_LEVEL_MS,
      GRAVITY_MIN_MS,
      GRAVITY_BASE_MS
    );
  }
  return fullRows.length;
}

/** Lock current piece: merge into board, clear lines, spawn next (or game over). */
function lockPiece(state: TetrisState, rng: () => number): void {
  mergeAndClearLines(state);
  state.gravityAccumulatorMs = 0;
  const spawned = spawnNextPiece(state, rng);
  if (spawned && collides(state.board, spawned)) {
    state.gameStatus = 'GAME_OVER';
    state.activePiece = null;
  }
}

/** Apply gravity: if interval elapsed, move down once; if can't move, lock. */
export function tickGravity(state: TetrisState, deltaMs: number, rng: () => number): void {
  if (state.gameStatus !== 'RUNNING' || !state.activePiece) return;
  const interval = state.softDropActive ? SOFT_DROP_INTERVAL_MS : state.gravityIntervalMs;
  state.gravityAccumulatorMs += deltaMs;
  while (state.gravityAccumulatorMs >= interval) {
    state.gravityAccumulatorMs -= interval;
    const moved = tryMove(state, 0, -1);
    if (!moved) {
      lockPiece(state, rng);
      return;
    }
  }
}

/** Force next piece type (for /spawn debug). Piece type 1..7. */
export function forceNextPiece(state: TetrisState, pieceType: PieceTypeId): void {
  state.nextPiece = createNextPiece(pieceType);
}

/** Fill a row for testing line clear (/fillrow). */
export function fillRow(state: TetrisState, y: number): void {
  if (y < 0 || y >= BOARD_HEIGHT) return;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    state.board[y][x] = 1; // use type 1 (I) as filler
  }
}
