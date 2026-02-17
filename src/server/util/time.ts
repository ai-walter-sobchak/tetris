/**
 * Time utilities for gravity and soft-drop intervals.
 */

/**
 * Clamp gravity interval to allowed range.
 */
export function clampGravityMs(ms: number, minMs: number, maxMs: number): number {
  return Math.max(minMs, Math.min(maxMs, Math.round(ms)));
}
