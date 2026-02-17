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

export function runTick(
  world: World,
  state: TetrisState,
  controllerPlayerId: string | null,
  deltaMs: number
): void {
  const rngObj = createRng(state.rngState != null ? state.rngState : state.seed);
  const rng = () => rngObj.next();

  // 0) Spawn piece if none (start of game or after lock)
  if (state.gameStatus === 'RUNNING' && !state.activePiece) {
    spawnNextPiece(state, rng);
    if (state.activePiece && collides(state.board, state.activePiece)) {
      state.gameStatus = 'GAME_OVER';
      state.activePiece = null;
    }
  }

  // 1) Consume one input from controller
  if (controllerPlayerId) {
    const { action, softDropActive } = consumeInput(controllerPlayerId);
    state.softDropActive = softDropActive;
    if (action === 'reset') {
      resetState(state);
      clearRenderCache();
      render(state, world);
      return;
    }
    if (state.gameStatus === 'RUNNING' && action) {
      if (action === 'left') tryMove(state, -1, 0);
      else if (action === 'right') tryMove(state, 1, 0);
      else if (action === 'rotate') tryRotate(state);
      else if (action === 'softDropDown' || action === 'softDropUp') {
        // already applied via softDropActive
      } else if (action === 'hardDrop') hardDrop(state, rng);
    }
  }

  // 2) Gravity (and lock when can't move down)
  const effectiveDeltaMs = Math.min(500, Math.max(50, deltaMs));
  tickGravity(state, effectiveDeltaMs, rng);

  // 3) Safeguard: spawn again if still no active piece (spawnNextPiece handles null nextPiece)
  if (state.gameStatus === 'RUNNING' && !state.activePiece) {
    spawnNextPiece(state, rng);
    if (state.activePiece && collides(state.board, state.activePiece)) {
      state.gameStatus = 'GAME_OVER';
      state.activePiece = null;
    }
  }

  // 4) Persist RNG state so next tick gets a different random piece
  state.rngState = rngObj.getState();

  // 5) Render
  render(state, world);
}
