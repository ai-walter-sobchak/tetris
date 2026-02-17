/**
 * Deterministic RNG for piece selection (and optional seed/replay).
 * Simple mulberry32. When seed is provided, sequence is reproducible.
 * Returns next() and getState() so the game can persist RNG state across ticks.
 */

export interface Rng {
  next(): number;
  getState(): number;
}

export function createRng(initialState?: number): Rng {
  let state = initialState ?? (Math.floor(Math.random() * 0xffffffff) >>> 0);
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0; // mulberry32
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
      return (t ^ (t >>> 14)) / 4294967296;
    },
    getState(): number {
      return state;
    },
  };
}

/** Return integer in [min, max] inclusive using rng(). */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
