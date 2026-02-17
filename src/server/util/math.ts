/**
 * Simple math helpers for Tetris (grid bounds, etc.).
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
