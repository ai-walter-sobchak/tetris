-- Global persistent leaderboard for Tetris.
-- Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- Players: stable id and display name (server upserts on join).
CREATE TABLE IF NOT EXISTS leaderboard_players (
  player_id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Best score per player (fast reads for top-N).
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  player_id TEXT PRIMARY KEY REFERENCES leaderboard_players(player_id) ON DELETE CASCADE,
  best_score BIGINT NOT NULL DEFAULT 0,
  best_score_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recent runs for auditing and "recent" views (optional).
CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES leaderboard_players(player_id) ON DELETE CASCADE,
  score BIGINT NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_runs_score_desc ON leaderboard_runs (score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_runs_player_ended ON leaderboard_runs (player_id, ended_at DESC);

-- Trigger: keep leaderboard_players.updated_at in sync (optional).
CREATE OR REPLACE FUNCTION leaderboard_players_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leaderboard_players_updated_at ON leaderboard_players;
CREATE TRIGGER leaderboard_players_updated_at
  BEFORE UPDATE ON leaderboard_players
  FOR EACH ROW EXECUTE PROCEDURE leaderboard_players_updated_at();

-- RLS: enable but no anon writes; server uses service_role (bypasses RLS).
ALTER TABLE leaderboard_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_runs ENABLE ROW LEVEL SECURITY;

-- Read-only for anon/authenticated if you ever use them from client; service_role bypasses.
CREATE POLICY "leaderboard_players_select" ON leaderboard_players FOR SELECT USING (true);
CREATE POLICY "leaderboard_scores_select" ON leaderboard_scores FOR SELECT USING (true);
CREATE POLICY "leaderboard_runs_select" ON leaderboard_runs FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE for anon or authenticated; only service_role can write.
-- (Omit policies for write → only service_role can write.)

-- Atomic submit: upsert player, insert run, update best score only if new score is higher.
CREATE OR REPLACE FUNCTION submit_score(
  p_player_id TEXT,
  p_display_name TEXT,
  p_score BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate: score must be non-negative and within bound
  IF p_score IS NULL OR p_score < 0 OR p_score > 1000000000 THEN
    RETURN;
  END IF;

  -- Upsert player
  INSERT INTO leaderboard_players (player_id, display_name)
  VALUES (p_player_id, NULLIF(TRIM(p_display_name), ''))
  ON CONFLICT (player_id) DO UPDATE SET
    display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), leaderboard_players.display_name),
    updated_at = now();

  -- Insert run (audit trail)
  INSERT INTO leaderboard_runs (player_id, score)
  VALUES (p_player_id, p_score);

  -- Update best score only if this score is higher
  INSERT INTO leaderboard_scores (player_id, best_score, best_score_at, updated_at)
  VALUES (p_player_id, p_score, now(), now())
  ON CONFLICT (player_id) DO UPDATE SET
    best_score = GREATEST(leaderboard_scores.best_score, EXCLUDED.best_score),
    best_score_at = CASE WHEN leaderboard_scores.best_score < EXCLUDED.best_score THEN now() ELSE leaderboard_scores.best_score_at END,
    updated_at = now();
END;
$$;
