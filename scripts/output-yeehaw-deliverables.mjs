/**
 * Output ASCII previews and JSON for Yeehaw 48×48 mural variants.
 * Run from repo root: node scripts/output-yeehaw-deliverables.mjs
 * Depends on built output: dist/server/assets/YeehawWall48.js (or run from TS with tsx).
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Try to load built module; fallback to inline build for standalone run
let YEEHAW_WALL_48_A, YEEHAW_WALL_48_B, toAscii, getMuralJson;
try {
  const mod = await import(join(root, 'dist/server/assets/YeehawWall48.js'));
  YEEHAW_WALL_48_A = mod.YEEHAW_WALL_48_A;
  YEEHAW_WALL_48_B = mod.YEEHAW_WALL_48_B;
  toAscii = mod.toAscii;
  getMuralJson = mod.getMuralJson;
} catch {
  console.error('Build first (npm run build) or run from TS. Using inline data...');
  process.exit(1);
}

const outDir = join(root, 'src/server/assets');
const prefix = (label) => `\n========== ${label} ==========\n`;

console.log(prefix('Variant A — ASCII'));
console.log(toAscii(YEEHAW_WALL_48_A));

console.log(prefix('Variant B — ASCII'));
console.log(toAscii(YEEHAW_WALL_48_B));

writeFileSync(
  join(outDir, 'yeehaw-wall-48-a.json'),
  JSON.stringify(getMuralJson(YEEHAW_WALL_48_A), null, 0)
);
writeFileSync(
  join(outDir, 'yeehaw-wall-48-b.json'),
  JSON.stringify(getMuralJson(YEEHAW_WALL_48_B), null, 0)
);
console.log(prefix('JSON'));
console.log('Written: src/server/assets/yeehaw-wall-48-a.json, yeehaw-wall-48-b.json');
