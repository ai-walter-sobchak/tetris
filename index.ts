/**
 * Tetris — HYTOPIA SDK entry point.
 * Server-authoritative, tick-based gravity, solo-first. One world, one board, first player is controller.
 */

import {
  startServer,
  Audio,
  DefaultPlayerEntity,
  DefaultPlayerEntityController,
  PlayerEvent,
  PlayerManager,
  PlayerUIEvent,
} from 'hytopia';
import type { World } from 'hytopia';
import { createInitialState } from './src/server/state/WorldState.js';
import type { TetrisState } from './src/server/state/types.js';
import { runTick } from './src/server/systems/GameLoop.js';
import { pushAction } from './src/server/systems/InputSystem.js';
import { clearRenderCache, render } from './src/server/systems/RenderSystem.js';
import { sendHudToPlayer } from './src/server/services/HudService.js';
import { handleCommand } from './src/server/services/CommandService.js';
import {
  BLOCK_TEXTURE_URIS,
  BOARD_WALL_BLOCK_ID,
  TICKS_PER_SECOND,
} from './src/server/config/tetris.js';
import { clearPlayer } from './src/server/systems/InputSystem.js';

const PLAYER_SPAWN = { x: 4, y: 10, z: 6 };

/** Block type id for spawn platform (floor). */
const FLOOR_BLOCK_ID = 8;

/** Build a small 5x3 platform under the player spawn so they land on it without blocking the board view. */
function placeSpawnPlatform(world: World): void {
  const y = PLAYER_SPAWN.y - 1; // block below feet
  for (let x = PLAYER_SPAWN.x - 2; x <= PLAYER_SPAWN.x + 2; x++) {
    for (let z = PLAYER_SPAWN.z - 1; z <= PLAYER_SPAWN.z + 1; z++) {
      world.chunkLattice.setBlock({ x, y, z }, FLOOR_BLOCK_ID);
    }
  }
}

startServer((world: World) => {
  const state: TetrisState = createInitialState();
  let controllerPlayerId: string | null = null;

  world.start();

  // Game soundtrack (loops for the whole session)
  new Audio({
    uri: 'audio/game-over.mp3',
    loop: true,
    volume: 0.5,
  }).play(world);

  // Register block types 1..7 for tetromino colors (0 = air)
  for (let id = 1; id <= 7; id++) {
    world.blockTypeRegistry.registerGenericBlockType({
      id,
      name: `tetris_${id}`,
      textureUri: BLOCK_TEXTURE_URIS[id] ?? 'blocks/stone.png',
    });
  }
  world.blockTypeRegistry.registerGenericBlockType({
    id: FLOOR_BLOCK_ID,
    name: 'floor',
    textureUri: 'blocks/stone.png',
  });
  world.blockTypeRegistry.registerGenericBlockType({
    id: BOARD_WALL_BLOCK_ID,
    name: 'wall',
    textureUri: 'blocks/stone.png',
  });

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    player.ui.load('ui/index.html');
    if (controllerPlayerId == null) {
      controllerPlayerId = player.id;
    }
    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: Record<string, unknown> }) => {
      const action = data?.action as string | undefined;
      if (typeof action === 'string') {
        pushAction(player.id, action as Parameters<typeof pushAction>[1]);
      }
    });
    sendHudToPlayer(player, state);

    // Force full board render so client sees current game state
    clearRenderCache();
    render(state, world);

    // No platform: player floats at spawn so the board view isn't blocked (gravity disabled)
    // placeSpawnPlatform(world);
    const playerEntity = new DefaultPlayerEntity({
      player,
      name: 'Player',
      gravityScale: 0, // float in space, don't fall
      controller: new DefaultPlayerEntityController({
        canWalk: () => false,
        canJump: () => false,
        canRun: () => false,
        canSwim: () => false,
      }),
    });
    playerEntity.spawn(world, PLAYER_SPAWN);
  });

  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    clearPlayer(player.id);
    if (controllerPlayerId === player.id) {
      controllerPlayerId = null;
    }
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach((e) => e.despawn());
  });

  world.on(PlayerEvent.CHAT_MESSAGE_SEND, ({ player, message }) => {
    const result = handleCommand(message, state);
    if (result.handled && result.message) {
      world.chatManager.sendPlayerMessage(player, result.message);
    }
  });

  // Run Tetris at a fixed tick rate so blocks fall even if the world loop timing varies or doesn't run
  const tickIntervalMs = 1000 / TICKS_PER_SECOND;
  clearRenderCache();
  render(state, world);
  const gameLoopHandle = setInterval(() => {
    runTick(world, state, controllerPlayerId, tickIntervalMs);
    PlayerManager.instance.getConnectedPlayersByWorld(world).forEach((player) => {
      sendHudToPlayer(player, state);
    });
  }, tickIntervalMs);
});
