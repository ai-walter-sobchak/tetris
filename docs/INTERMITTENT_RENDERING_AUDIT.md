# Intermittent Rendering Audit — HYTOPIA SDK Tetris

## Wiring Summary: Ticking, Rendering, and Input

- **Entry**: `startServer((world) => { ... })` runs once. It calls `world.start()`, then registers block types (1–7, floor, wall), defines `startGameLoop()` and `tick()`, and subscribes to `PlayerEvent.JOINED_WORLD`, `LEFT_WORLD`, `CHAT_MESSAGE_SEND`. At the end it runs `clearRenderCache()` and `render(state, world)` once.
- **Tick driver**: The game loop is **not** driven by a HYTOPIA world loop. It runs only when the user sends UI action `'start'`, which calls `startGameLoop()`: that does `setTimeout(tick, 0)` and `setInterval(tick, tickIntervalMs)` (50 ms at 20 TPS). So there is a single `setInterval`; no second tick source.
- **Tick body**: `tick()` calls `runTick(world, state, controllerPlayerId, tickIntervalMs)` (always 50 ms), then sends HUD and mutes non-soundtrack audio. So `deltaMs` is fixed (50), not wall-clock elapsed time.
- **runTick flow**: (0) Spawn if no active piece → (1) consume one input (reset → clear cache + render + return) → (2) soft drop one row if held → (3) clamp `effectiveDeltaMs` to [50, 500], seed gravity accumulator if 0, then `tickGravity(state, effectiveDeltaMs, rng)` → (4) safeguard spawn if still no piece → (5) persist RNG → (6) `render(state, world)` → (7) emergency spawn if still no piece and re-render.
- **Input**: `InputSystem` keeps a per-player queue and `softDropActive`. `pushAction` is called from `PlayerUIEvent.DATA`; `consumeInput(controllerPlayerId)` is called once per tick in `runTick`. Only the first joiner is `controllerPlayerId`; if they leave, input is no longer consumed (no auto reassign).
- **Rendering**: `RenderSystem.render(state, world)` builds a `desired` Map of grid cell keys `"x,y"` to block id (0 = air, 1–7 = piece types, 15 = wall). It diffs against module-level `lastRendered`, calls `world.chunkLattice.setBlock(pos, next)` only where `prev !== next`, then sets `lastRendered = desired`. So rendering is incremental (diff-based). `clearRenderCache()` sets `lastRendered = new Map()` and is used on reset, on Start, on JOINED_WORLD, and in the initial server callback.

---

## 1) Fast diagnosis (top 3 most likely causes, ranked)

1. **RenderSystem diff cache ahead of actual world state**  
   The renderer assumes every `setBlock` is applied immediately. If the engine batches or defers updates, `lastRendered` can represent a “future” state while the client still shows an older one. Later ticks only send deltas from that future state, so the visible board can lag or appear to freeze until something forces a full redraw.

2. **Block type registration after `world.start()`**  
   Block types 1–7 (and floor/wall) are registered after `world.start()`. If the world or chunk system does work before the callback finishes (e.g. first frame or chunk sync), `setBlock` for those IDs might be ignored or mis-handled until registration is done, causing intermittent missing or wrong blocks.

3. **RenderSystem crash or bad dimensions**  
   If `state.board` is empty or malformed, `state.board[0].length` in `render()` can throw. The tick then fails mid-run; the interval keeps firing with possibly inconsistent state, and the next render might see corrupted data, producing freezes or partial updates.

---

## 2) Evidence: file/line and why they can cause intermittent stalls

- **RenderSystem.ts:52–88 (diff + cache)**  
  - Builds `desired`, diffs against `lastRendered`, writes only changed cells, then `lastRendered = desired`.  
  - If `chunkLattice.setBlock` is not applied synchronously (or is batched), the in-memory cache is updated while the world is still showing the previous frame. Subsequent renders send only “current vs lastRendered” deltas, so updates that never made it to the client are never re-sent.  
  - **Verification**: Temporarily disable diffing (full redraw every tick); if stalls disappear, cache/engine ordering is the cause.

- **RenderSystem.ts:54–55**  
  - `const width = state.board[0].length; const height = state.board.length;`  
  - If `state.board` is `[]` or `state.board[0]` is missing (e.g. after a hypothetical bug or mutation), this throws. The exception aborts the tick and can leave state and `lastRendered` out of sync with the world.  
  - **Verification**: Add a guard (e.g. `if (!state.board.length || !state.board[0]) return;`) or assert; reproduce with stress (fast line clears, resets).

- **index.ts:49 then 75–91**  
  - `world.start()` is called before registering block types.  
  - Any world/chunk logic that runs immediately after `start()` (or before the callback returns) might see setBlock calls for IDs that are not yet registered, leading to no-ops or undefined behavior and intermittent wrong/missing blocks.  
  - **Verification**: Move block registration above `world.start()` and see if visual glitches decrease.

- **GameLoop.ts:58–62 (gravity accumulator)**  
  - `effectiveDeltaMs` is clamped; when `gravityAccumulatorMs === 0` it is seeded with the interval. Logic is consistent for fixed 50 ms ticks; no evidence of gravity “stopping” from this.  
  - If the event loop is starved, ticks run late but still use fixed 50 ms, so real-time drop rate can slow; that can feel like freezing but is a different issue (fixed vs elapsed time).

- **index.ts:96–104 (single interval, no reentrancy)**  
  - One `setInterval(tick, tickIntervalMs)` and one `setTimeout(tick, 0)`; `tick` is synchronous. No evidence of overlapping ticks or double intervals.  
  - **Verification**: Add a “tick in progress” guard and log; expect at most one active at a time.

- **RenderSystem.ts:21–35 (getDesiredCell)**  
  - Active piece is applied first, then board. Bounds use `state.board.length` and `state.board[0].length`. No early return that would skip the active piece; piece cells are included in the play-area iteration via `getDesiredCell`.  
  - Board origin and walls use `BOARD_ORIGIN`, `BOARD_WIDTH`, `BOARD_HEIGHT` from config; `gridToWorld` is consistent. No out-of-bounds write in the diff loop.

- **Block IDs**  
  - `PIECE_TYPE_TO_BLOCK_ID` maps 1–7 → 1–7; 0 is used for air. Config and `blockTypeRegistry` in index register 1–7 and wall 15. IDs match.  
  - **Verification**: Assert in render that every written `blockId` is 0 or in the registered set.

---

## 3) Instrumentation plan: exact console logs

Add these logs to confirm hypotheses (remove or gate behind a debug flag for production).

| What to log | Where | Expected / interpretation |
|-------------|--------|---------------------------|
| `lastRendered.size` before diff, number of `prev !== next` writes, and `desired.size` after build | RenderSystem.ts at start of diff loop and after loop | If write count is 0 for several ticks while piece moved, diff is wrong or cache is ahead. |
| `state.board.length`, `state.board[0]?.length` at top of `render()` | RenderSystem.ts line ~53 | Non–BOARD_HEIGHT / BOARD_WIDTH or undefined → bad state. |
| `world.chunkLattice.setBlock(pos, next)` — log `pos`, `next` for each call (or count per tick) | RenderSystem.ts inside `if (prev !== next)` | High count on piece move; 0 when piece moved → cache bug. |
| One line per tick: `tickId`, `activePiece?.y`, `gravityAccumulatorMs`, `gameStatus` | GameLoop.ts start of runTick (tickId from a module counter) | If `activePiece.y` doesn’t change for many ticks while RUNNING, gravity or lock is stuck. |
| “Tick started” / “Tick ended” with same tickId | Start and end of `tick()` in index.ts | If “Tick started” appears again before “Tick ended”, tick is re-entrant. |
| “startGameLoop” and “setInterval id” | index.ts startGameLoop | Called once; one interval id. |
| When `clearRenderCache()` is called (caller or stack) | RenderSystem.ts clearRenderCache | Only on reset, Start, JOINED_WORLD, and server init. |

**Optional instrumentation snippets** (gate with `const DEBUG_TETRIS = true`):

- RenderSystem.ts, after building `desired`:  
  `if (DEBUG_TETRIS) { let writes = 0; /* in loop: writes++; */ console.log('render', { lastSize: lastRendered.size, desiredSize: desired.size, writes }); }`
- GameLoop.ts, start of runTick:  
  `if (DEBUG_TETRIS) console.log('tick', { pieceY: state.activePiece?.y, grav: state.gravityAccumulatorMs, status: state.gameStatus });`
- index.ts, in tick():  
  `if (DEBUG_TETRIS) console.log('tick start');` at top and `if (DEBUG_TETRIS) console.log('tick end');` in finally.

---

## 4) Patch plan: file-by-file change list

### 4.1 MVP (simplest robust fix — full redraw per tick) [IMPLEMENTED]

**Goal**: Remove dependency on diff cache so that even if the engine batches setBlock, every tick pushes the full board. Sacrifice a bit of performance for correctness.

- **RenderSystem.ts** (done)
  - `RENDER_FULL_REDRAW_EVERY_TICK = true` forces a full write every tick; set to `false` for diff-only once stable.
  - Guard at top of `render()`: `state.board` existence and dimensions checked; return if invalid.
  - `VALID_BLOCK_IDS` guard before each `setBlock` to avoid writing invalid block ids.

### 4.2 index.ts

- **Block registration before world.start()**  
  Move the block type registration block (lines 75–91) to **before** `world.start()` (e.g. right after `let controllerPlayerId = null;`).  
  This ensures all block IDs are registered before any world/chunk work runs.

- **Optional**: In `tick()`, wrap `runTick(...)` in try/catch; on error log and optionally call `clearRenderCache()` and `render(state, world)` so the next tick doesn’t rely on a bad cache.

### 4.3 GameLoop.ts

- **Optional**: After step 6, if you keep emergency spawn (step 7), ensure you don’t double-render when no emergency spawn is needed (current code is fine).  
- **Optional**: Pass actual elapsed time into `runTick` (e.g. `Date.now() - lastTickTime`) and use clamped delta for gravity so that under load the game doesn’t appear to freeze; keep clamp to avoid spiral of death.

### 4.4 Optional optimized version (after MVP is stable)

- **RenderSystem.ts**  
  - Re-enable diff-only updates.  
  - Add a “generation” or “tick id” passed from GameLoop; every N ticks (e.g. 10) or when generation is 0, do a full redraw and set `lastRendered = desired`; otherwise do diff as today.  
  - Or: if the SDK exposes a “flush” or “commit” after setBlock, call it at the end of render so that `lastRendered` only advances after the engine has applied the frame.

---

## 5) Minimal repro script and telemetry

**Steps to reproduce**

1. Start the server, join the world, load UI.  
2. Click Start so the game loop runs.  
3. Let the piece fall without input for 10–20 seconds; repeat 5–10 times.  
4. In other runs: use soft drop, hard drop, rotate, move; do line clears and resets.  
5. Note when blocks “freeze” (piece stops moving), “drop a few then stop”, or desync (board state vs visible blocks).

**What telemetry confirms the fix**

- With instrumentation: when a freeze happens, check whether “write count” in render was 0 for several ticks while `activePiece.y` changed in runTick (indicates cache ahead of world).  
- After moving block registration before `world.start()`: see if freezes or wrong blocks decrease.  
- After MVP full redraw: if intermittent stalls disappear, the cause was diff/cache vs engine ordering.  
- After adding the `state.board` guard: if you ever see a “render skip” log or counter increment, the guard prevented a throw and possible state corruption.

---

## 6) Guardrails: assertions and safety checks

- **RenderSystem.ts**  
  - At top of `render()`:  
    `if (!state.board?.length || !state.board[0]) { /* log */ return; }`  
  - Assert (or validate) that `state.board.length === BOARD_HEIGHT` and `state.board[0].length === BOARD_WIDTH` (or log and early-return).  
  - Before `setBlock`: assert `next` is 0 or in the set of registered block IDs used by this game (e.g. 0, 1..7, 15, and floor 8 if used).  
  - Optionally: cap the number of setBlock calls per tick (e.g. BOARD_WIDTH*BOARD_HEIGHT + wall count); if exceeded, log and force clearRenderCache on next tick.

- **GameLoop.ts**  
  - At start of runTick: assert `state.board.length === BOARD_HEIGHT` and `state.board[0].length === BOARD_WIDTH` (or equivalent from config).  
  - After tickGravity: if `state.gameStatus === 'RUNNING'` and `!state.activePiece`, assert or log “expected spawn”; the existing safeguard spawn is the recovery.

- **index.ts**  
  - In `tick()`: a simple reentrancy guard, e.g. `if (tickInProgress) return; tickInProgress = true; try { runTick(...); } finally { tickInProgress = false; }`.  
  - In `startGameLoop()`: after `setInterval`, assert `gameLoopStarted === true` and `gameLoopIntervalRef != null`.

- **TetrisSystem.ts / WorldState.ts**  
  - After `mergeAndClearLines` (or any place that mutates `state.board`): assert `state.board.length === BOARD_HEIGHT` and each row length === BOARD_WIDTH.

These guardrails prevent silent state corruption and make the next occurrence easier to diagnose.
