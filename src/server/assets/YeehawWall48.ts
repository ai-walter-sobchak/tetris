/**
 * Yeehaw Games — 48×48 left-wall pixel mural.
 * Two variants: A = silhouette only; B = silhouette + "YEEHAW" text.
 * Values: 0 = background, 1 = foreground, 2 = shadow (optional).
 */

const W = 48;
const H = 48;

function createGrid(): number[][] {
  return Array.from({ length: H }, () => Array(W).fill(0));
}

function fillRect(grid: number[][], c1: number, r1: number, c2: number, r2: number, v: number): void {
  for (let r = r1; r <= r2; r++) {
    if (r < 0 || r >= H) continue;
    for (let c = c1; c <= c2; c++) {
      if (c >= 0 && c < W) grid[r][c] = v;
    }
  }
}

/** Build silhouette only: lasso arc, hat, head, torso, raised arm. No text. */
function buildSilhouette(grid: number[][]): void {
  const fg = 1;
  // 1–2px margin: content in cols 1..46, rows 1..35
  // — Lasso: 2px thick. Left strand cols 7–8, rows 2–22
  fillRect(grid, 7, 2, 8, 22, fg);
  // Top arc: rows 0–2, cols 9–39 (curved cap)
  fillRect(grid, 9, 0, 39, 0, fg);
  fillRect(grid, 10, 1, 38, 1, fg);
  fillRect(grid, 11, 2, 37, 2, fg);
  // Right strand cols 37–38, rows 2–24
  fillRect(grid, 37, 2, 38, 24, fg);
  // Bottom of loop rows 24–25, cols 10–37
  fillRect(grid, 10, 24, 37, 25, fg);
  // — Hat brim: 2px min → 3 rows, cols 11–37
  fillRect(grid, 11, 5, 37, 7, fg);
  // Hat crown (under lasso): rows 4–14, cols 19–29
  fillRect(grid, 19, 4, 29, 14, fg);
  // — Head (no face): rows 14–21, cols 17–31
  fillRect(grid, 17, 14, 31, 21, fg);
  // — Torso: rows 21–33, cols 15–33
  fillRect(grid, 15, 21, 33, 33, fg);
  // — Raised left arm: 2px thick from torso to lasso. Vertical col 9–10 rows 8–20, bridge 11–16 row 9–10
  fillRect(grid, 9, 8, 10, 20, fg);
  fillRect(grid, 11, 9, 16, 10, fg);
  fillRect(grid, 15, 11, 16, 21, fg);
  // — Right arm (hip): small 2px block
  fillRect(grid, 31, 23, 33, 25, fg);
}

/** Blocky "YEEHAW": 6×10 grid per char, 3–4px effective stroke (chunky). */
function drawYeehawSimple(grid: number[][], startRow: number): void {
  const fg = 1;
  // Centered: "YEEHAW" ≈ 36 cols wide → start at 6
  const sx = 6;
  const w = 6;
  const h = 10;
  // Pre-drawn as filled blocks (3–4px stroke = chunky)
  const Y = [
    '..#..#', '..#..#', '..#..#', '..#..#', '..#..#', '######', '######', '..#..#', '..#..#', '..#..#',
  ];
  const E = [
    '######', '######', '#....#', '#....#', '######', '######', '#....#', '#....#', '######', '######',
  ];
  const H = [
    '#....#', '#....#', '#....#', '#....#', '######', '######', '#....#', '#....#', '#....#', '#....#',
  ];
  const A = [
    '..##..', '.#..#.', '#....#', '######', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#',
  ];
  const W = [
    '#....#', '#....#', '#....#', '#..#.#', '#.#.#.', '##..##', '#....#', '#....#', '#....#', '#....#',
  ];
  const chars = [Y, E, E, H, A, W];
  chars.forEach((rows, i) => {
    const cx = sx + i * w;
    rows.forEach((line, r) => {
      const row = startRow + r;
      if (row >= H) return;
      for (let c = 0; c < w; c++) {
        if (line[c] === '#') {
          const col = cx + c;
          if (col >= 0 && col < W) grid[row][col] = fg;
        }
      }
    });
  });
}

/** Variant A: silhouette only (no text). */
export function buildVariantA(): number[][] {
  const grid = createGrid();
  buildSilhouette(grid);
  return grid;
}

/** Variant B: silhouette + "YEEHAW" in bottom 12 rows. */
export function buildVariantB(): number[][] {
  const grid = createGrid();
  buildSilhouette(grid);
  // Text in rows 35–44 (10 rows), 2px margin above (row 35) and below (45–47)
  drawYeehawSimple(grid, 35);
  return grid;
}

export const YEEHAW_WALL_48_A: number[][] = buildVariantA();
export const YEEHAW_WALL_48_B: number[][] = buildVariantB();

/** Default export: recommended variant (B). */
export const YEEHAW_WALL_48: number[][] = YEEHAW_WALL_48_B;

/** Machine-readable mural: 0=bg, 1=fg, 2=shadow(optional). */
export function getMuralJson(grid: number[][]): { width: number; height: number; pixels: number[][] } {
  return { width: W, height: H, pixels: grid.map(row => [...row]) };
}

/** ASCII preview: # = fg, . = bg, + = shadow. Row/col indices every 8. */
export function toAscii(grid: number[][]): string {
  const lines: string[] = [];
  const header = '     ' + Array.from({ length: Math.ceil(W / 8) }, (_, i) => String(i * 8).padStart(6)).join('');
  lines.push(header);
  grid.forEach((row, r) => {
    const idx = r % 8 === 0 ? String(r).padStart(4) : '    ';
    const content = row.map(v => (v === 0 ? '.' : v === 2 ? '+' : '#')).join('');
    lines.push(idx + ' ' + content);
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// INTEGRATION SNIPPET — render 48×48 mural as left wall with a generic tile API
// ---------------------------------------------------------------------------
// Assume: setTile(x: number, y: number, tileId: number) places one tile at (x,y).
// Map pixel values to tile IDs:
//
//   const TILE_BG = 0;       // or your background wall block id
//   const TILE_FG = 15;       // or your foreground mural block id
//   const TILE_SHADOW = 14;   // optional, if using value 2
//
//   import { YEEHAW_WALL_48 } from './YeehawWall48.js';
//
//   function renderYeehawMural(wallX: number, wallY: number): void {
//     const mural = YEEHAW_WALL_48;
//     for (let row = 0; row < mural.length; row++) {
//       for (let col = 0; col < mural[row].length; col++) {
//         const v = mural[row][col];
//         const tileId = v === 0 ? TILE_BG : v === 2 ? TILE_SHADOW : TILE_FG;
//         setTile(wallX + col, wallY + row, tileId);
//       }
//     }
//   }
//
//   // Example: anchor top-left of mural at (0, 0) for left wall
//   renderYeehawMural(0, 0);
// ---------------------------------------------------------------------------
