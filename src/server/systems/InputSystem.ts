/**
 * InputSystem: collects UI (and optional keyboard) input per player, one queue per controller.
 * MVP: single player; first joiner is controller. Actions are consumed each tick to avoid double-processing.
 */

export type InputAction =
  | 'start'
  | 'left'
  | 'right'
  | 'rotate'
  | 'softDropDown'
  | 'softDropUp'
  | 'hardDrop'
  | 'reset';

/** Per-player input state: queue of actions to process this tick, and soft-drop hold state. */
export interface PlayerInputState {
  /** Actions to process (one consumption per tick for move/rotate/hardDrop/reset). */
  queue: InputAction[];
  /** True when soft drop is held (from softDropDown until softDropUp). */
  softDropActive: boolean;
}

const controllerStates = new Map<string, PlayerInputState>();

function getOrCreateState(playerId: string): PlayerInputState {
  let s = controllerStates.get(playerId);
  if (!s) {
    s = { queue: [], softDropActive: false };
    controllerStates.set(playerId, s);
  }
  return s;
}

/** Push an action from UI (e.g. button click or key). */
export function pushAction(playerId: string, action: InputAction): void {
  const s = getOrCreateState(playerId);
  if (action === 'softDropDown') {
    s.softDropActive = true;
    return;
  }
  if (action === 'softDropUp') {
    s.softDropActive = false;
    return;
  }
  s.queue.push(action);
}

/**
 * Consume and return the next action for this player, and current soft-drop state.
 * Call once per tick. Returns { action, softDropActive }.
 */
export function consumeInput(playerId: string): { action: InputAction | null; softDropActive: boolean } {
  const s = getOrCreateState(playerId);
  const action = s.queue.shift() ?? null;
  return { action, softDropActive: s.softDropActive };
}

/** Clear state when player leaves (optional). */
export function clearPlayer(playerId: string): void {
  controllerStates.delete(playerId);
}
