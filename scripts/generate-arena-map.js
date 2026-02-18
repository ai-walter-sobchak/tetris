#!/usr/bin/env node
/**
 * Generate assets/map.json for the multi-player Tetris game arena.
 * One shared arena containing 8 plot areas; each plot has a clearance where
 * the server draws the procedural board + walls at runtime.
 *
 * Layout must match PlotManager: PLOT_COLS=4, PLOT_ROWS=2, PLOT_SPACING_X=40, PLOT_SPACING_Z=28,
 * PLOT_ORIGIN_BASE=(0,0,0). Per-plot clearance (board + walls): x in [ox-3, ox+12], y in [-4,22], z in [oz-2, oz+1].
 *
 * Block IDs: 8=floor, 15=wall (stone), 11=oak-log (trim), 5=accent, 12=sand (stage).
 */

const PLOT_COLS = 4;
const PLOT_ROWS = 2;
const PLOT_SPACING_X = 40;
const PLOT_SPACING_Z = 28;
const PLOT_ORIGIN_X = 0;
const PLOT_ORIGIN_Y = 0;
const PLOT_ORIGIN_Z = 0;

// Per-plot clearance in local coords (same as PlotManager bounds)
const BOARD_X_LO = -3;
const BOARD_X_HI = 12;
const BOARD_Y_LO = -4;
const BOARD_Y_HI = 22;
const BOARD_Z_LO = -2;
const BOARD_Z_HI = 1;

const MARGIN = 20;
const WALL_Y_LO = 1;
const WALL_Y_HI = 20;
const CEILING_Y = 21;
const FLOOR_Y = 0;

// World bounds that contain all 8 plots plus margin
const LAST_PLOT_X = PLOT_ORIGIN_X + (PLOT_COLS - 1) * PLOT_SPACING_X;
const LAST_PLOT_Z = PLOT_ORIGIN_Z + (PLOT_ROWS - 1) * PLOT_SPACING_Z;
const ROOM_MIN_X = PLOT_ORIGIN_X - MARGIN;
const ROOM_MAX_X = LAST_PLOT_X + BOARD_X_HI + MARGIN;
const ROOM_MIN_Z = PLOT_ORIGIN_Z - MARGIN;
const ROOM_MAX_Z = LAST_PLOT_Z + BOARD_Z_HI + MARGIN;

function isInAnyPlotClearance(x, y, z) {
  for (let row = 0; row < PLOT_ROWS; row++) {
    for (let col = 0; col < PLOT_COLS; col++) {
      const ox = PLOT_ORIGIN_X + col * PLOT_SPACING_X;
      const oz = PLOT_ORIGIN_Z + row * PLOT_SPACING_Z;
      if (
        x >= ox + BOARD_X_LO && x <= ox + BOARD_X_HI &&
        y >= PLOT_ORIGIN_Y + BOARD_Y_LO && y <= PLOT_ORIGIN_Y + BOARD_Y_HI &&
        z >= oz + BOARD_Z_LO && z <= oz + BOARD_Z_HI
      ) {
        return true;
      }
    }
  }
  return false;
}

const BLOCK = {
  FLOOR: 8,
  WALL: 15,
  TRIM: 11,
  ACCENT: 5,
  STAGE: 12,
};

const blocks = {};

function set(x, y, z, id) {
  if (isInAnyPlotClearance(x, y, z)) return;
  blocks[`${x},${y},${z}`] = id;
}

// Floor (y=0): checkerboard across entire arena, except inside any plot clearance
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    if (isInAnyPlotClearance(x, FLOOR_Y, z)) continue;
    const isSand = ((x + z) % 2 + 2) % 2 === 1;
    blocks[`${x},${FLOOR_Y},${z}`] = isSand ? BLOCK.STAGE : BLOCK.FLOOR;
  }
}

// Back wall (z = ROOM_MIN_Z)
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
    set(x, y, ROOM_MIN_Z, BLOCK.WALL);
  }
}
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  set(x, 1, ROOM_MIN_Z, BLOCK.TRIM);
}

// Front wall (z = ROOM_MAX_Z)
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
    set(x, y, ROOM_MAX_Z, BLOCK.WALL);
  }
}
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  set(x, 1, ROOM_MAX_Z, BLOCK.TRIM);
}

// Left wall (x = ROOM_MIN_X)
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MIN_X, y, z, BLOCK.WALL);
  }
}
for (const wy of [2, 11, 19]) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MIN_X, wy, z, BLOCK.TRIM);
  }
}

// Right wall (x = ROOM_MAX_X)
for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MAX_X, y, z, BLOCK.WALL);
  }
}
for (const wy of [2, 11, 19]) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(ROOM_MAX_X, wy, z, BLOCK.TRIM);
  }
}

// Ceiling
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  for (let z = ROOM_MIN_Z; z <= ROOM_MAX_Z; z++) {
    set(x, CEILING_Y, z, BLOCK.WALL);
  }
}
for (let x = ROOM_MIN_X; x <= ROOM_MAX_X; x++) {
  set(x, CEILING_Y, ROOM_MAX_Z, BLOCK.TRIM);
  set(x, CEILING_Y, ROOM_MIN_Z, BLOCK.TRIM);
}

// Stage strip in front of each plot (player standing area): for each plot origin, y=1, z from oz+2 to oz+8, x from ox-2 to ox+11
for (let row = 0; row < PLOT_ROWS; row++) {
  for (let col = 0; col < PLOT_COLS; col++) {
    const ox = PLOT_ORIGIN_X + col * PLOT_SPACING_X;
    const oz = PLOT_ORIGIN_Z + row * PLOT_SPACING_Z;
    for (let x = ox - 2; x <= ox + 11; x++) {
      for (let z = oz + 2; z <= oz + 8; z++) {
        if (isInAnyPlotClearance(x, 1, z)) continue;
        set(x, 1, z, BLOCK.STAGE);
      }
    }
  }
}

// Corner pillars (oak-log)
const corners = [
  [ROOM_MIN_X, ROOM_MIN_Z],
  [ROOM_MIN_X, ROOM_MAX_Z],
  [ROOM_MAX_X, ROOM_MIN_Z],
  [ROOM_MAX_X, ROOM_MAX_Z],
];
for (const [px, pz] of corners) {
  for (let y = WALL_Y_LO; y <= WALL_Y_HI; y++) {
    set(px, y, pz, BLOCK.TRIM);
  }
}

// blockTypes: match what index.ts / map expect (id 8=floor, 11=oak-log, etc.)
const blockTypes = [
  { id: 1, name: "andesite", textureUri: "blocks/andesite.png", isCustom: false, isMultiTexture: false },
  { id: 2, name: "birch-leaves", textureUri: "blocks/birch-leaves.png", isCustom: false, isMultiTexture: false },
  { id: 3, name: "bricks", textureUri: "blocks/bricks.png", isCustom: false, isMultiTexture: false },
  { id: 4, name: "coal-ore", textureUri: "blocks/coal-ore.png", isCustom: false, isMultiTexture: false },
  { id: 5, name: "cobblestone", textureUri: "blocks/cobblestone.png", isCustom: false, isMultiTexture: false },
  { id: 6, name: "grass-block-pine", textureUri: "blocks/grass-block-pine", isCustom: false, isMultiTexture: true },
  { id: 7, name: "grass-block", textureUri: "blocks/grass-block", isCustom: false, isMultiTexture: true },
  { id: 8, name: "grass-flower-block-pine", textureUri: "blocks/grass-flower-block-pine", isCustom: false, isMultiTexture: true },
  { id: 9, name: "grass-flower-block", textureUri: "blocks/grass-flower-block", isCustom: false, isMultiTexture: true },
  { id: 10, name: "oak-leaves", textureUri: "blocks/oak-leaves.png", isCustom: false, isMultiTexture: false },
  { id: 11, name: "oak-log", textureUri: "blocks/oak-log", isCustom: false, isMultiTexture: true },
  { id: 12, name: "sand", textureUri: "blocks/sand.png", isCustom: false, isMultiTexture: false },
  { id: 13, name: "spruce-leaves", textureUri: "blocks/spruce-leaves.png", isCustom: false, isMultiTexture: false },
  { id: 14, name: "spruce-log", textureUri: "blocks/spruce-log", isCustom: false, isMultiTexture: true },
  { id: 15, name: "stone", textureUri: "blocks/stone.png", isCustom: false, isMultiTexture: false },
  { id: 16, name: "water", textureUri: "blocks/water.png", isCustom: false, isMultiTexture: false, isLiquid: true },
  { id: 17, name: "lamp", textureUri: "blocks/wool-yellow.png", isCustom: false, isMultiTexture: false },
];

const map = { blockTypes, blocks, entities: {}, version: "2.0.0" };
console.log(JSON.stringify(map, null, 2));
