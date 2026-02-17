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

/** Call once at startup to log whether Supabase env is present (no secrets printed). */
export function logLeaderboardEnvStatus(): void {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  const urlSet = Boolean(url && url.startsWith('https://'));
  const keySet = Boolean(key && key.length > 0);
  if (typeof console !== 'undefined' && console.warn) {
    if (urlSet && keySet) {
      console.warn('[Leaderboard] Supabase env OK (URL + key set). Connecting to:', url?.replace(/\/$/, ''));
    } else {
      console.warn('[Leaderboard] Supabase env missing. URL set:', urlSet, 'Key set:', keySet, '- leaderboard disabled.');
    }
  }
}

/** One-time connectivity check: direct fetch to Supabase to surface the real network error (cause). */
export async function checkSupabaseConnectivity(): Promise<void> {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key || !url.startsWith('https://')) return;
  const restUrl = url.replace(/\/$/, '') + '/rest/v1/';
  try {
    const res = await fetch(restUrl, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: 'Bearer ' + key },
    });
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Leaderboard] Supabase reachable. Status:', res.status);
    }
  } catch (err) {
    const cause = err instanceof Error ? (err as Error & { cause?: Error & { code?: string } }).cause : null;
    const code = cause && typeof cause.code === 'string' ? cause.code : '';
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Leaderboard] Supabase unreachable:', err instanceof Error ? err.message : String(err), code ? '(' + code + ')' : '', cause ? '- ' + String(cause) : '');
    }
  }
}
