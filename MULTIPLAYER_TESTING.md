# Multi-Player Presence — How to Test

## Prerequisites

- Server running (`npm run dev` or equivalent).
- Two different browser windows (or one normal + one incognito) so you have two distinct HYTOPIA sessions.

## Manual Test Steps (2 Players)

### 1. First player joins

1. Open the game in **Browser A** and join the world.
2. **Expected:** Player gets a plot; camera shows their Tetris board. HUD shows Score 0, Level 1, Lines 0, "Click Start to begin."
3. Type `/myplot` in chat. **Expected:** Reply like `Your plot: plot_0 at (0,0,0).`
4. Click **Start**. **Expected:** Game starts; pieces spawn and fall; HUD updates (score, level, lines).
5. Play a few moves: move left/right, rotate, soft drop, hard drop. **Expected:** Only this board reacts; no errors.

### 2. Second player joins (same world)

1. In **Browser B**, open the game and join the **same world**.
2. **Expected:** Second player gets a **different** plot (e.g. `plot_1`). Camera in B shows **their** board, not Player A’s.
3. In B, type `/myplot`. **Expected:** Different plot id (e.g. `plot_1`) and different coordinates.
4. In B, click **Start**. **Expected:** B’s game starts independently.

### 3. Isolated gameplay (no cross-affection)

1. In **Browser A**: move/rotate/drop pieces and clear some lines. Note A’s score/lines.
2. In **Browser B**: do different moves (e.g. only move left, or hard drop).
3. **Expected:**
   - A’s HUD shows only A’s score/lines/level/next.
   - B’s HUD shows only B’s score/lines/level/next.
   - Moving in A does **not** change B’s board, and vice versa.
4. Optional: in A type `/reset`. **Expected:** Only A’s board resets; B’s board unchanged.

### 4. Commands

- In A: `/myplot` → A’s plot id and origin.
- In B: `/myplot` → B’s plot id and origin (different).
- Either: `/plots` → List of all plots and which player id (or "free") is assigned.
- In A: `/reset` → Only A’s game resets.

### 5. Leave / rejoin

1. In **Browser B**, leave the world (disconnect or switch world).
2. **Expected:** B’s plot is freed; their board region is cleared (no leftover blocks).
3. In **Browser A**, keep playing. **Expected:** A’s game continues; no crash.
4. Rejoin with **Browser B**. **Expected:** B gets a plot again (possibly same or different); new game on that plot.

### 6. All plots full (optional, need 9+ clients to fill 8 plots)

1. With 8 players in the world (each with a plot), have a **ninth** player join.
2. **Expected:** Ninth player sees "All plots full. Wait for a free plot." (or similar); no plot assigned; no crash.
3. One player leaves. **Expected:** That plot freed. Next joiner (or the waiting ninth) can get a plot.

## Quick Sanity Checklist

- [ ] Two players in same world each have their own board and HUD.
- [ ] Moving/rotating/dropping in one window does not change the other’s board.
- [ ] `/myplot` and `/plots` show correct assignment.
- [ ] `/reset` only resets the typing player’s instance.
- [ ] When a player leaves, their plot is cleared and freed; no crash with 0 players or rapid join/leave.
