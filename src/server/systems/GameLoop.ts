/**
 * GameLoop: drives Tetris tick from world loop event.
 * Runs TetrisSystem (gravity, lock), applies one consumed input per tick, then RenderSystem.
 */

import type { World } from 'hytopia';
import type { TetrisState } from '../state/types.js';
import { tryMove, tryRotate, hardDrop, tickGravity, collides } from './TetrisSystem.js';
import { render, clearRenderCache } from './RenderSystem.js';
import { consumeInput } from './InputSystem.js';
import { resetState, spawnNextPiece } from '../state/WorldState.js';
import { createRng } from '../util/rng.js';
import { BOARD_WIDTH, BOARD_HEIGHT } from '../config/tetris.js';

function getRngSeed(state: TetrisState): number | undefined {
  const r = state.rngState;
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  return state.seed;
}

export function runTick(
  world: World,
  state: TetrisState,
  controllerPlayerId: string | null,
  deltaMs: number,
  gameStarted: boolean
): void {
  // Guard: avoid running logic on corrupted board state
  if (!state.board?.length || state.board.length !== BOARD_HEIGHT || !state.board[0] || state.board[0].length !== BOARD_WIDTH) {
    return;
  }

  // 1) Always consume one input so Start/R and other actions are processed even before "game started"
  if (controllerPlayerId) {
    const { action, softDropActive } = consumeInput(controllerPlayerId);
    state.softDropActive = softDropActive;
    if (action === 'reset') {
      resetState(state);
      clearRenderCache(world);
      render(state, world);
      return;
    }
    if (state.gameStatus === 'RUNNING' && action && action !== 'start') {
      if (action === 'left') tryMove(state, -1, 0);
      else if (action === 'right') tryMove(state, 1, 0);
      else if (action === 'rotate') tryRotate(state);
      else if (action === 'softDropDown' || action === 'softDropUp') {
        // already applied via softDropActive
      } else if (action === 'hardDrop') {
        const rngObj = createRng(getRngSeed(state));
        hardDrop(state, () => rngObj.next());
        state.rngState = rngObj.getState();
      }
    }
  }

  // When game not started yet, only consume input and render (no gravity) so Start/R always work
  if (!gameStarted) {
    render(state, world);
    return;
  }

  const rngObj = createRng(getRngSeed(state));
  const rng = () => rngObj.next();

  // 0) Spawn piece if none (start of game or after lock)
  if (state.gameStatus === 'RUNNING' && !state.activePiece) {
    spawnNextPiece(state, rng);
    if (state.activePiece && collides(state.board, state.activePiece)) {
      state.gameStatus = 'GAME_OVER';
      state.activePiece = null;
    }
  }

  // 2) Soft drop: one row per tick when holding (makes drop responsive)
  if (state.gameStatus === 'RUNNING' && state.activePiece && state.softDropActive) {
    tryMove(state, 0, -1);
  }

  // 3) Gravity (and lock when can't move down)
  const effectiveDeltaMs = Math.min(500, Math.max(50, deltaMs));
  if (state.activePiece && state.gravityAccumulatorMs === 0) {
    state.gravityAccumulatorMs = state.softDropActive ? 50 : state.gravityIntervalMs;
  }
  tickGravity(state, effectiveDeltaMs, rng);

  // 4) Safeguard: spawn again if still no active piece (spawnNextPiece handles null nextPiece)
  if (state.gameStatus === 'RUNNING' && !state.activePiece) {
    spawnNextPiece(state, rng);
    if (state.activePiece && collides(state.board, state.activePiece)) {
      state.gameStatus = 'GAME_OVER';
      state.activePiece = null;
    }
  }

  // 5) Persist RNG state so next tick gets a different random piece
  state.rngState = rngObj.getState();

  // 6) Render
  render(state, world);

  // 7) Emergency spawn: if still no piece (e.g. lock path missed), spawn and re-render
  if (state.gameStatus === 'RUNNING' && !state.activePiece) {
    spawnNextPiece(state, () => rngObj.next());
    state.rngState = rngObj.getState();
    if (state.activePiece && collides(state.board, state.activePiece)) {
      state.gameStatus = 'GAME_OVER';
      state.activePiece = null;
    }
    render(state, world);
  }
}
