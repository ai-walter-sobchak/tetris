/**
 * LeaderboardService: persistent global leaderboard in Supabase.
 * Server-only; uses service role key. Upserts players, submits scores on game over,
 * caches top-N, and broadcasts to all players. Safe on Supabase outage (logs, continues).
 */

import type { Player, World } from 'hytopia';
import { PlayerManager } from 'hytopia';
import {
  LEADERBOARD_TOP_N,
  LEADERBOARD_CACHE_TTL_MS,
  LEADERBOARD_REFRESH_MS,
  LEADERBOARD_SUBMIT_COOLDOWN_MS,
  LEADERBOARD_OFFLINE_THRESHOLD_MS,
  MAX_SCORE,
  getSupabaseUrl,
  getSupabaseServiceRoleKey,
} from '../config/leaderboard.js';
import type { LeaderboardPayload, LeaderboardRow } from '../schema/hudMessages.js';
import { sendLeaderboardToPlayer } from './HudService.js';

type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;

interface CachedLeaderboard {
  payload: LeaderboardPayload;
  fetchedAt: number;
}

const EMPTY_PAYLOAD: LeaderboardPayload = {
  status: 'offline',
  updatedAtMs: 0,
  rows: [],
};

let supabase: SupabaseClient | null | undefined = undefined;
let clientPromise: Promise<SupabaseClient | null> | null = null;
let cache: CachedLeaderboard | null = null;
const lastSubmitByPlayer = new Map<string, number>();
let lastSuccessfulFetchAt = 0;
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

async function getClient(): Promise<SupabaseClient | null> {
  if (supabase !== undefined) return supabase;
  if (clientPromise) return clientPromise;
  clientPromise = (async (): Promise<SupabaseClient | null> => {
    const url = getSupabaseUrl();
    const key = getSupabaseServiceRoleKey();
    if (!url || !key) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Leaderboard] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; leaderboard disabled.');
      }
      supabase = null;
      return null;
    }
    try {
      const { createClient } = (await import('@supabase/supabase-js')) as typeof import('@supabase/supabase-js');
      supabase = createClient(url, key, { auth: { persistSession: false } });
      return supabase;
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Leaderboard] Failed to create Supabase client:', err);
      }
      supabase = null;
      return null;
    }
  })();
  return clientPromise;
}

function isCacheStale(): boolean {
  if (!cache) return true;
  return Date.now() - cache.fetchedAt > LEADERBOARD_CACHE_TTL_MS;
}

function buildPayload(rows: LeaderboardRow[], selfPlayerId?: string): LeaderboardPayload {
  const now = Date.now();
  const isOffline = lastSuccessfulFetchAt > 0 && now - lastSuccessfulFetchAt > LEADERBOARD_OFFLINE_THRESHOLD_MS;
  return {
    status: isOffline ? 'offline' : 'online',
    updatedAtMs: now,
    rows,
    selfPlayerId,
  };
}

async function fetchTopNFromDb(): Promise<LeaderboardRow[]> {
  const client = await getClient();
  if (!client) return [];

  const { data, error } = await client
    .from('leaderboard_scores')
    .select('player_id, best_score, best_score_at')
    .order('best_score', { ascending: false })
    .order('best_score_at', { ascending: true })
    .limit(LEADERBOARD_TOP_N);

  if (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Leaderboard] fetch top N failed:', error.message);
    }
    return [];
  }

  lastSuccessfulFetchAt = Date.now();
  if (!Array.isArray(data) || data.length === 0) return [];

  const names = new Map<string, string>();
  const playerIds = data.map((r: { player_id: string }) => r.player_id);
  const { data: players } = await client
    .from('leaderboard_players')
    .select('player_id, display_name')
    .in('player_id', playerIds);

  if (Array.isArray(players)) {
    for (const p of players) {
      names.set(p.player_id, p.display_name ?? p.player_id);
    }
  }

  let rank = 1;
  return data.map((row: { player_id: string; best_score: number }) => ({
    rank: rank++,
    playerId: row.player_id,
    name: names.get(row.player_id) ?? row.player_id,
    score: Number(row.best_score),
  }));
}

/** Refresh cache from DB; on success lastSuccessfulFetchAt is set inside fetchTopNFromDb. */
export async function refreshCache(): Promise<void> {
  const rows = await fetchTopNFromDb();
  cache = {
    payload: buildPayload(rows),
    fetchedAt: Date.now(),
  };
}

/**
 * Returns current leaderboard payload for HUD (cached). If cache is stale, triggers
 * refresh in background but returns current cache (or offline) immediately.
 */
export function getLeaderboardForHud(selfPlayerId?: string): LeaderboardPayload {
  if (isCacheStale()) {
    refreshCache().catch(() => {});
  }
  if (!cache) {
    return { ...EMPTY_PAYLOAD, updatedAtMs: Date.now(), selfPlayerId };
  }
  return {
    ...cache.payload,
    updatedAtMs: Date.now(),
    selfPlayerId,
    status:
      lastSuccessfulFetchAt > 0 && Date.now() - lastSuccessfulFetchAt > LEADERBOARD_OFFLINE_THRESHOLD_MS
        ? 'offline'
        : cache.payload.status,
  };
}

/** Upsert player profile (call on join). */
export async function upsertPlayer(player: Player): Promise<void> {
  const client = await getClient();
  if (!client) return;

  const playerId = String(player.id);
  const displayName = typeof (player as { name?: string }).name === 'string' ? (player as { name?: string }).name : playerId;

  const { error } = await client.from('leaderboard_players').upsert(
    { player_id: playerId, display_name: displayName, updated_at: new Date().toISOString() },
    { onConflict: 'player_id' }
  );

  if (error && typeof console !== 'undefined' && console.error) {
    console.error('[Leaderboard] upsert player failed:', error.message);
  }
}

/** Validate score: finite integer in [0, MAX_SCORE]. */
function isValidScore(score: number): boolean {
  return (
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= MAX_SCORE &&
    Math.floor(score) === score
  );
}

/**
 * Submit score on game over. Rate-limited per player (LEADERBOARD_SUBMIT_COOLDOWN_MS).
 * Only updates best score if this score is higher (handled by DB RPC).
 */
export async function submitScore(player: Player, score: number): Promise<void> {
  if (!isValidScore(score)) return;

  const playerId = String(player.id);
  const now = Date.now();
  const last = lastSubmitByPlayer.get(playerId) ?? 0;
  if (now - last < LEADERBOARD_SUBMIT_COOLDOWN_MS) return;
  lastSubmitByPlayer.set(playerId, now);

  const client = await getClient();
  if (!client) return;

  const displayName = typeof (player as { name?: string }).name === 'string' ? (player as { name?: string }).name : playerId;

  const { error } = await client.rpc('submit_score', {
    p_player_id: playerId,
    p_display_name: displayName ?? '',
    p_score: Math.floor(score),
  });

  if (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Leaderboard] submit_score failed:', error.message);
    }
    return;
  }

  await refreshCache();
}

/** Send current leaderboard to all connected players in the world. */
export function broadcastLeaderboard(world: World): void {
  const players = PlayerManager.instance.getConnectedPlayersByWorld(world);
  const payload = getLeaderboardForHud();
  for (const player of players) {
    const selfPayload: LeaderboardPayload = { ...payload, selfPlayerId: String(player.id) };
    sendLeaderboardToPlayer(player, selfPayload);
  }
}

/**
 * Start periodic refresh and broadcast (every LEADERBOARD_REFRESH_MS).
 * Call once after server/world is ready. Cleans up on stop.
 */
export function startLeaderboardBroadcastInterval(world: World): void {
  if (refreshIntervalId != null) return;
  refreshIntervalId = setInterval(async () => {
    await refreshCache();
    broadcastLeaderboard(world);
  }, LEADERBOARD_REFRESH_MS);
}

/** Clear interval on server shutdown. */
export function stopLeaderboardBroadcastInterval(): void {
  if (refreshIntervalId != null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}
