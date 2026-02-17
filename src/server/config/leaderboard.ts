/**
 * Leaderboard configuration.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only).
 */

export const LEADERBOARD_TOP_N = 10;
export const LEADERBOARD_REFRESH_MS = 5000;
export const LEADERBOARD_CACHE_TTL_MS = 7000;
export const LEADERBOARD_SUBMIT_COOLDOWN_MS = 3000;
/** Consider leaderboard offline if last successful fetch is older than this. */
export const LEADERBOARD_OFFLINE_THRESHOLD_MS = 30_000;
export const MAX_SCORE = 1_000_000_000;

export function getSupabaseUrl(): string | undefined {
  return typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;
}
