/**
 * PlotManager: allocates and releases private Tetris plots per player.
 * Each plot has an origin (board 0,0 in world), bounds, and spawn point.
 * Max players = PLOT_COUNT; no PvP, state fully isolated per plot.
 *
 * Architecture: we do NOT clone a map chunk. One logical "plot" (board + walls)
 * is rendered procedurally at each of N different world origins. Each origin is
 * a separate instance—boards are not connected and plots are in different areas.
 */

import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  WALL_SIDE_X,
  WALL_BOTTOM_THICKNESS,
  WALL_TOP_THICKNESS,
  WALL_DEPTH,
  WALL_DEPTH_BACK,
} from '../config/tetris.js';

// --- Plot layout constants ---
export const PLOT_COUNT = 8;
export const PLOT_COLS = 4;
export const PLOT_ROWS = 2;

/** One plot's width in world units (board + left/right walls). */
const PLOT_WIDTH_X = BOARD_WIDTH + 2 * WALL_SIDE_X;
/** One plot's depth in Z (front + back walls). */
const PLOT_DEPTH_Z = WALL_DEPTH + WALL_DEPTH_BACK;

/**
 * World units between plot origins (X). Large gap so plots are clearly separate areas;
 * boards are not connected and each plot feels like its own space.
 */
export const PLOT_SPACING_X = PLOT_WIDTH_X + 24;
/**
 * World units between plot origins (Z). Same idea—clear separation between rows of plots.
 */
export const PLOT_SPACING_Z = PLOT_DEPTH_Z + 24;

/** Base world position for the first plot origin. */
export const PLOT_ORIGIN_BASE = { x: 0, y: 0, z: 0 };

/** Spawn offset in front of board (player stands here to play). */
const SPAWN_OFFSET_X = Math.floor(BOARD_WIDTH / 2);
const SPAWN_OFFSET_Y = 0;
const SPAWN_OFFSET_Z = WALL_DEPTH + 2;

export interface Plot {
  id: string;
  /** World position where board (0,0) maps. */
  origin: { x: number; y: number; z: number };
  /** Local bounds for this plot (for clear region): min/max in world coords. */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** World position where player is teleported when assigned. */
  spawnPoint: { x: number; y: number; z: number };
  /** Set when a player is assigned; undefined when free. */
  assignedPlayerId?: string;
}

const plots: Plot[] = [];
/** playerId -> Plot (for routing input and HUD). */
const playerToPlot = new Map<string, Plot>();

function plotLocalBounds(): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  return {
    minX: -WALL_SIDE_X,
    maxX: BOARD_WIDTH + WALL_SIDE_X - 1,
    minY: -WALL_BOTTOM_THICKNESS,
    maxY: BOARD_HEIGHT + WALL_TOP_THICKNESS - 1,
    minZ: -WALL_DEPTH_BACK,
    maxZ: WALL_DEPTH - 1,
  };
}

/**
 * Initialize plot definitions. Call once when world starts.
 * Creates a grid of PLOT_COUNT plots (PLOT_ROWS x PLOT_COLS).
 */
export function initPlots(): void {
  if (plots.length > 0) return;
  const local = plotLocalBounds();
  let idx = 0;
  for (let row = 0; row < PLOT_ROWS; row++) {
    for (let col = 0; col < PLOT_COLS; col++) {
      const origin = {
        x: PLOT_ORIGIN_BASE.x + col * PLOT_SPACING_X,
        y: PLOT_ORIGIN_BASE.y,
        z: PLOT_ORIGIN_BASE.z + row * PLOT_SPACING_Z,
      };
      const bounds = {
        minX: origin.x + local.minX,
        maxX: origin.x + local.maxX,
        minY: origin.y + local.minY,
        maxY: origin.y + local.maxY,
        minZ: origin.z + local.minZ,
        maxZ: origin.z + local.maxZ,
      };
      const spawnPoint = {
        x: origin.x + SPAWN_OFFSET_X,
        y: origin.y + SPAWN_OFFSET_Y,
        z: origin.z + SPAWN_OFFSET_Z,
      };
      plots.push({
        id: `plot_${idx}`,
        origin: { ...origin },
        bounds,
        spawnPoint: { ...spawnPoint },
      });
      idx++;
      if (idx >= PLOT_COUNT) break;
    }
    if (idx >= PLOT_COUNT) break;
  }
}

/**
 * Assign an available plot to the player. Returns the plot or null if all occupied.
 */
export function assignPlot(playerId: string): Plot | null {
  if (playerToPlot.has(playerId)) return playerToPlot.get(playerId)!;
  const plot = plots.find((p) => !p.assignedPlayerId);
  if (!plot) return null;
  plot.assignedPlayerId = playerId;
  playerToPlot.set(playerId, plot);
  return plot;
}

/**
 * Release the plot assigned to the player. Idempotent.
 */
export function releasePlot(playerId: string): void {
  const plot = playerToPlot.get(playerId);
  if (!plot) return;
  plot.assignedPlayerId = undefined;
  playerToPlot.delete(playerId);
}

/**
 * Get the plot assigned to the player, if any.
 */
export function getPlotByPlayer(playerId: string): Plot | undefined {
  return playerToPlot.get(playerId);
}

/**
 * Get all plots (for admin /plots and iteration).
 */
export function getAllPlots(): Plot[] {
  return [...plots];
}

/**
 * Number of plots (max concurrent players with active boards).
 */
export function getMaxPlots(): number {
  return plots.length || PLOT_COUNT;
}
