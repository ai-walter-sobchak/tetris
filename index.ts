/**
 * Tetris — HYTOPIA SDK entry point.
 * Multi-player presence: each player gets a private plot with isolated Tetris instance.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logLeaderboardEnvStatus, checkSupabaseConnectivity } from './src/server/config/leaderboard.js';
import { startServer, Audio, PlayerEvent, PlayerManager, PlayerUIEvent } from 'hytopia';
import type { World, WorldMap } from 'hytopia';
import { runTick } from './src/server/systems/GameLoop.js';
import { pushAction } from './src/server/systems/InputSystem.js';
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
  BOARD_WIDTH,
  BOARD_WALL_BLOCK_ID,
  TICKS_PER_SECOND,
  WALL_DEPTH,
  WALL_DEPTH_BACK,
} from './src/server/config/tetris.js';
import { clearPlayer } from './src/server/systems/InputSystem.js';
import { tickBoundaryLava } from './src/server/systems/LavafallSystem.js';
import type { LavafallState } from './src/server/systems/LavafallSystem.js';
import { initPlots, assignPlot, releasePlot } from './src/server/plots/PlotManager.js';
import { GameInstance } from './src/server/game/GameInstance.js';
import { registerInstance, unregisterInstance, getAllInstances, getInstanceByPlayer } from './src/server/game/InstanceRegistry.js';

/** Block type id for floor (used by map). */
const FLOOR_BLOCK_ID = 8;

/** Path to the arena map (loaded so the room is not empty). */
const MAP_PATH = join(process.cwd(), 'assets', 'map.json');

/** Camera offset from plot origin so each player looks at their own board. */
function cameraPositionForPlot(origin: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: origin.x + Math.floor(BOARD_WIDTH / 2),
    y: origin.y + Math.floor(BOARD_HEIGHT / 2),
    z: origin.z + 6,
  };
}

startServer((world: World) => {
  initPlots();

  // Load arena map first (floor, walls, stage, etc.)
  try {
    const mapJson = readFileSync(MAP_PATH, 'utf-8');
    const map = JSON.parse(mapJson) as WorldMap;
    world.loadMap(map);
  } catch (err) {
    console.warn('Tetris: could not load assets/map.json:', (err as Error).message);
  }

  // Register block types before world.start()
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
    textureUri: 'blocks/oak-log',
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

  /** Track which players we've already submitted game-over score for (avoid duplicate submit). */
  const gameOverSubmittedIds = new Set<string>();
  /** Players who joined but got no plot (all full). Show NO_PLOT in HUD. */
  const noPlotPlayerIds = new Set<string>();

  let gameLoopIntervalRef: ReturnType<typeof setInterval> | null = null;
  let tickInProgress = false;
  const tickIntervalMs = 1000 / TICKS_PER_SECOND;

  function startTickInterval(): void {
    if (gameLoopIntervalRef != null) return;
    setTimeout(tick, 0);
    gameLoopIntervalRef = setInterval(tick, tickIntervalMs);
  }

  function tick(): void {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      muteNonSoundtrackAudio();
      runTick(world, tickIntervalMs);

      // Game over: submit each affected player's score once
      for (const instance of getAllInstances()) {
        if (instance.state.gameStatus === 'GAME_OVER' && !gameOverSubmittedIds.has(instance.playerId)) {
          const pl = PlayerManager.instance.getConnectedPlayersByWorld(world).find((p) => p.id === instance.playerId);
          if (pl) {
            gameOverSubmittedIds.add(instance.playerId);
            submitScore(pl, instance.state.score).then(() => {
              refreshCache();
              broadcastLeaderboard(world);
            });
          }
        }
      }

      PlayerManager.instance.getConnectedPlayersByWorld(world).forEach((player) => {
        sendHudToPlayer(player, getLeaderboardForHud(String(player.id)), noPlotPlayerIds.has(player.id));
      });
      muteNonSoundtrackAudio();

      const now = Date.now();
      if (now - lavaState.lastMs >= LAVA_TICK_MS) {
        lavaState.frame = (lavaState.frame + 1) % LAVA_FRAME_IDS.length;
        lavaState.lastMs = now;
      }
      // Boundary lava per active plot
      for (const instance of getAllInstances()) {
        tickBoundaryLava(
          world,
          lavaState.frame,
          LAVA_FRAME_IDS,
          instance.plot.origin,
          BOARD_WIDTH,
          BOARD_HEIGHT,
          boundaryZOffsets
        );
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('[Tetris] tick error', err);
    } finally {
      tickInProgress = false;
    }
  }

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    player.ui.load('ui/index.html');
    startTickInterval();

    const plot = assignPlot(player.id);
    if (plot) {
      const instance = new GameInstance(plot, player.id);
      registerInstance(player.id, instance);
      instance.render(world);
      // Spawn point is available as plot.spawnPoint when using a PlayerEntity; camera targets this plot
      player.camera.setAttachedToPosition(cameraPositionForPlot(plot.origin));
    } else {
      noPlotPlayerIds.add(player.id);
      player.camera.setAttachedToPosition({ x: 0, y: 10, z: 0 });
      // HUD will show NO_PLOT via sendHudToPlayer
    }

    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: Record<string, unknown> }) => {
      const action = data?.action as string | undefined;
      if (typeof action === 'string') {
        pushAction(player.id, action as Parameters<typeof pushAction>[1]);
        if (action === 'start') {
          const inst = getInstanceByPlayer(player.id);
          if (inst) inst.setGameStarted();
        }
      }
    });

    upsertPlayer(player).then(() => {});
    sendHudToPlayer(player, getLeaderboardForHud(String(player.id)), noPlotPlayerIds.has(player.id));
  });

  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const instance = getInstanceByPlayer(player.id);
    if (instance) {
      instance.clearAndDestroy(world);
      unregisterInstance(player.id);
    }
    releasePlot(player.id);
    clearPlayer(player.id);
    gameOverSubmittedIds.delete(player.id);
    noPlotPlayerIds.delete(player.id);
  });

  world.on(PlayerEvent.CHAT_MESSAGE_SEND, ({ player, message }) => {
    const result = handleCommand(player.id, message);
    if (result.handled && result.message) {
      world.chatManager.sendPlayerMessage(player, result.message);
    }
  });
});
