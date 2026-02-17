/**
 * Tetris — HYTOPIA SDK entry point.
 * Server-authoritative, tick-based gravity, solo-first. One world, one board, first player is controller.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logLeaderboardEnvStatus, checkSupabaseConnectivity } from './src/server/config/leaderboard.js';
import { startServer, Audio, PlayerEvent, PlayerManager, PlayerUIEvent } from 'hytopia';
import type { World, WorldMap } from 'hytopia';
import { createInitialState } from './src/server/state/WorldState.js';
import type { TetrisState } from './src/server/state/types.js';
import { runTick } from './src/server/systems/GameLoop.js';
import { pushAction } from './src/server/systems/InputSystem.js';
import { clearRenderCache, render } from './src/server/systems/RenderSystem.js';
import { sendHudToPlayer } from './src/server/services/HudService.js';
import { handleCommand } from './src/server/services/CommandService.js';
import {
  getLeaderboardForHud,
  upsertPlayer,
  submitScore,
  broadcastLeaderboard,
  startLeaderboardBroadcastInterval,
  refreshCache,
} from './src/server/services/LeaderboardService.js';
import {
  BLOCK_TEXTURE_URIS,
  BOARD_HEIGHT,
  BOARD_ORIGIN,
  BOARD_WIDTH,
  BOARD_WALL_BLOCK_ID,
  TICKS_PER_SECOND,
  WALL_DEPTH,
  WALL_DEPTH_BACK,
} from './src/server/config/tetris.js';
import { clearPlayer } from './src/server/systems/InputSystem.js';
import { tickBoundaryLava } from './src/server/systems/LavafallSystem.js';
import type { LavafallState } from './src/server/systems/LavafallSystem.js';

/** Camera position (no player entity — fixed view for Tetris). */
const CAMERA_POSITION = { x: 4, y: 10, z: 6 };

/** Block type id for floor (used by map). */
const FLOOR_BLOCK_ID = 8;

/** Path to the arena map (loaded so the room is not empty). */
const MAP_PATH = join(process.cwd(), 'assets', 'map.json');

startServer((world: World) => {
  const state: TetrisState = createInitialState();
  let controllerPlayerId: string | null = null;
  let prevGameStatus: typeof state.gameStatus = state.gameStatus;

  // Load arena map first (floor, walls, stage, etc.); then we override block types 1–7, 8, 15 for Tetris/floor/wall
  try {
    const mapJson = readFileSync(MAP_PATH, 'utf-8');
    const map = JSON.parse(mapJson) as WorldMap;
    world.loadMap(map);
  } catch (err) {
    console.warn('Tetris: could not load assets/map.json:', (err as Error).message);
  }

  // Register block types before world.start() so chunk/world logic never sees unregistered IDs
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
    textureUri: 'blocks/oak-log', // board frame = oak (multi-texture)
  });

  const LAVA_FRAME_IDS = [201, 202, 203, 204];
  const LAVA_TEXTURES = ['blocks/lava.png', 'blocks/lava.png', 'blocks/lava-stone.png', 'blocks/lava.png'];
  LAVA_FRAME_IDS.forEach((id, i) => {
    world.blockTypeRegistry.registerGenericBlockType({
      id,
      name: `lava_frame_${i + 1}`,
      textureUri: LAVA_TEXTURES[i] ?? 'blocks/lava.png',
    });
  });

  world.start();

  logLeaderboardEnvStatus();
  checkSupabaseConnectivity().catch(() => {});

  startLeaderboardBroadcastInterval(world);

  const SOUNDTRACK_URI = 'audio/game-over.mp3';
  const soundtrack = new Audio({
    uri: SOUNDTRACK_URI,
    loop: true,
    volume: 0.5,
  });
  soundtrack.play(world);

  /** Stop and remove any non-soundtrack audio (footsteps, block crunch/collision SFX, etc.) so only the soundtrack plays. */
  function muteNonSoundtrackAudio(): void {
    const toRemove: Audio[] = [];
    world.audioManager.getAllAudios().forEach((audio) => {
      if (audio.uri !== SOUNDTRACK_URI) toRemove.push(audio);
    });
    toRemove.forEach((audio) => {
      try {
        world.audioManager.unregisterAudio(audio);
      } catch {
        audio.setVolume(0);
        audio.pause();
      }
    });
  }

  const lavaState: LavafallState = { lastMs: 0, frame: 0 };
  const LAVA_TICK_MS = 120;
  const boundaryZOffsets: number[] = [];
  for (let z = -WALL_DEPTH_BACK; z < 0; z++) boundaryZOffsets.push(z);
  for (let z = 0; z < WALL_DEPTH; z++) boundaryZOffsets.push(z);

  let gameLoopStarted = false;
  let gameLoopIntervalRef: ReturnType<typeof setInterval> | null = null;
  let tickInProgress = false;
  const tickIntervalMs = 1000 / TICKS_PER_SECOND;

  /** Start the tick interval so actions (Start, R) are always consumed. Call when first player joins. */
  function startTickInterval(): void {
    if (gameLoopIntervalRef != null) return;
    clearRenderCache(world);
    render(state, world);
    setTimeout(tick, 0);
    gameLoopIntervalRef = setInterval(tick, tickIntervalMs);
  }

  /** Called when user clicks Start: enable gravity and game logic. */
  function setGameStarted(): void {
    if (gameLoopStarted) return;
    gameLoopStarted = true;
    clearRenderCache(world);
    render(state, world);
  }

  function tick(): void {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      muteNonSoundtrackAudio(); // Strip any SFX (steps, crunch, etc.) before tick
      runTick(world, state, controllerPlayerId, tickIntervalMs, gameLoopStarted);
      // Game over: submit controller's score and broadcast leaderboard (server-authoritative)
      if (prevGameStatus === 'RUNNING' && state.gameStatus === 'GAME_OVER' && controllerPlayerId) {
        const controller = PlayerManager.instance.getConnectedPlayersByWorld(world).find((p) => p.id === controllerPlayerId);
        if (controller) {
          submitScore(controller, state.score).then(() => {
            refreshCache();
            broadcastLeaderboard(world);
          });
        }
      }
      prevGameStatus = state.gameStatus;
      PlayerManager.instance.getConnectedPlayersByWorld(world).forEach((player) => {
        sendHudToPlayer(player, state, gameLoopStarted);
      });
      muteNonSoundtrackAudio(); // Again after tick so only soundtrack remains
      const now = Date.now();
      if (now - lavaState.lastMs >= LAVA_TICK_MS) {
        lavaState.frame = (lavaState.frame + 1) % LAVA_FRAME_IDS.length;
        lavaState.lastMs = now;
      }
      tickBoundaryLava(world, lavaState.frame, LAVA_FRAME_IDS, BOARD_ORIGIN, BOARD_WIDTH, BOARD_HEIGHT, boundaryZOffsets);
    } catch (err) {
      clearRenderCache(world);
      render(state, world);
      if (typeof console !== 'undefined' && console.error) console.error('[Tetris] tick error', err);
    } finally {
      tickInProgress = false;
    }
  }

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    player.ui.load('ui/index.html');
    if (controllerPlayerId == null) {
      controllerPlayerId = player.id;
    }
    startTickInterval();
    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: Record<string, unknown> }) => {
      const action = data?.action as string | undefined;
      if (typeof action === 'string') {
        pushAction(player.id, action as Parameters<typeof pushAction>[1]);
        if (action === 'start') setGameStarted();
      }
    });
    upsertPlayer(player).then(() => {});
    const leaderboardPayload = getLeaderboardForHud(String(player.id));
    sendHudToPlayer(player, state, gameLoopStarted, leaderboardPayload);

    // Force full board render so client sees current game state
    clearRenderCache(world);
    render(state, world);

    // No player entity: fix camera at the same view position so it doesn't get in the way
    player.camera.setAttachedToPosition(CAMERA_POSITION);
  });

  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    clearPlayer(player.id);
    if (controllerPlayerId === player.id) {
      controllerPlayerId = null;
    }
  });

  world.on(PlayerEvent.CHAT_MESSAGE_SEND, ({ player, message }) => {
    const result = handleCommand(message, state);
    if (result.handled && result.message) {
      world.chatManager.sendPlayerMessage(player, result.message);
    }
  });

  clearRenderCache(world);
  render(state, world);
});
