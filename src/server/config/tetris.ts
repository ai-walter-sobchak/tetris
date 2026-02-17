/**
 * Tetris game configuration.
 * Board dimensions, gravity, scoring, and block type mapping.
 */

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

/** World origin for the board: first cell (0,0) maps to this world position. */
export const BOARD_ORIGIN = { x: 0, y: 0, z: 0 };

/** Block type id for the visible board boundary (walls). Must exist in map blockTypes (e.g. stone = 15). */
export const BOARD_WALL_BLOCK_ID = 15;

/** Spawn position: grid column and row. Top of 4x4 piece box; piece must fit in 0..BOARD_HEIGHT-1. */
export const SPAWN_X = 3; // center-ish for 4-cell-wide pieces (e.g. I spans 3,4,5,6)
export const SPAWN_Y = BOARD_HEIGHT - 4; // 16: so lowest cell of any 4-high rotation is at row 19

/** Gravity: interval in ms between automatic downward moves. Decreases with level. */
export const GRAVITY_BASE_MS = 800;
export const GRAVITY_DECREASE_PER_LEVEL_MS = 60;
export const GRAVITY_MIN_MS = 100;

/** Soft drop: interval in ms when soft-drop is active (faster than gravity). */
export const SOFT_DROP_INTERVAL_MS = 50;

/** Lines per level before level increases. */
export const LINES_PER_LEVEL = 10;

/** Score per lines cleared in one move (classic-ish). */
export const SCORE_PER_LINES: Record<number, number> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

/** Piece type id to block type id (1-7). 0 is reserved for air. */
export const PIECE_TYPE_TO_BLOCK_ID: Record<number, number> = {
  1: 1, // I -> block 1
  2: 2, // O
  3: 3, // T
  4: 4, // S
  5: 5, // Z
  6: 6, // J
  7: 7, // L
};

/** Default texture names for block types (use textures from assets atlas). */
export const BLOCK_TEXTURE_URIS: Record<number, string> = {
  1: 'blocks/wool-cyan.png',
  2: 'blocks/wool-yellow.png',
  3: 'blocks/wool-purple.png',
  4: 'blocks/wool-green.png',
  5: 'blocks/wool-red.png',
  6: 'blocks/wool-blue.png',
  7: 'blocks/wool-orange.png',
};

/** Game loop tick rate: target ticks per second. */
export const TICKS_PER_SECOND = 20;

/** Wall-kick offsets for rotation (try in order): (dx, dy) in grid units. */
export const WALL_KICK_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [2, 0],
  [-2, 0],
  [0, -1],
];
