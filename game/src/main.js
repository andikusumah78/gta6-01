// Vice Shores — entry point. Boots the city, wires Builder A's core (world,
// player, cars, camera, input) to Builder B's systems (traffic, police,
// missions, combat, HUD, audio, save, shots) and runs the game loop.
//
// State machine: menu -> playing -> paused -> playing, or playing ->
// busted / wasted / mission-complete. ?seed=N fixes the city; ?shot=
// start|drive|chase|mission stages a deterministic scene for screenshots.
import * as THREE from 'three';
import { CITY, SPAWN } from './config.js';
import { createRandom, seedFromURL } from './random.js';
import { buildWorld } from './world.js';
import { initRenderer, followCamera, orbitMenuCamera } from './render.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createCar, nearestCar, enterCar, exitCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { initHUD } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame } from './save.js';
import { applyShotParams } from './shots.js';

const MAX_FRAME = 0.05;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = seedFromURL(1);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const { renderer, scene, camera } = initRenderer(canvas);
const world = buildWorld(scene, rng);
const input = createInput(canvas);
const player = createPlayer(scene);
player.setPosition(SPAWN.x, SPAWN.z, SPAWN.heading);

const hud = initHUD();
const audio = createAudio();

// Parked cars the player can steal, from the world's spawn points.
const parkedStyles = ['sedan', 'taxi', 'pickup', 'sedan', 'sedan', 'pickup', 'taxi', 'sedan', 'pickup', 'sedan'];
const parkedCars = world.spawnPoints.cars.map((spot, i) => createCar(scene, parkedStyles[i % parkedStyles.length], spot));

// The shared game object handed to missions and shots.
const game = {
  player,
  hud,
  audio,
  save: { saveGame, loadGame, save: saveGame, load: loadGame },
  world,
  police: null,
  traffic: null,
  missions: null,
  combat: null,
  input,
  camera,
  scene,
  renderer,
  parkedCars,
  seed,
  state: 'menu',
  currentCar: null,
  crimes: {},
};

const police = createPolice(scene, world, rng);
const traffic = createTraffic(scene, world, rng);
game.police = police;
game.traffic = traffic;
const missions = createMissions(game);
game.missions = missions;
const combat = createCombat(scene, camera, world);
game.combat = combat;
window.__game = game;

// Missions report objective text through this hook when they support it.
if (missions && typeof missions === 'object') {
  try {
    missions.onObjective = (text) => hud.setObjective(text);
  } catch {
    // Read-only hook on some builds: the loop below reads missions.current instead.
  }
}

const saved = loadGame();
const saveExists = !!saved;
hud.showStart(saveExists);

let state = 'menu';
let menuTime = 0;
let muted = false;
let endShown = false;

function allCars() {
  return parkedCars.concat(traffic.cars || [], police.policeCars || []);
}

function objectiveText() {
  const current = missions && missions.current;
  // The objective (which missions rewrite as stages advance) comes first:
  // the name is only a fallback, or the HUD would show "The Big Score"
  // forever and never the actual instruction.
  if (current) return current.objective || current.title || current.name || 'Free roam';
  return 'Free roam — find work around Vice Shores.';
}

function collectState() {
  return {
    player: {
      x: player.pos.x,
      z: player.pos.z,
      heading: player.heading,
      health: player.health,
      money: player.money,
    },
    mission: missions && missions.current ? missions.current.index ?? missions.current.id ?? 0 : 0,
    wanted: police.wanted || 0,
    seed,
  };
}

function applySave(data) {
  if (!data || !data.player) return;
  player.setPosition(data.player.x ?? SPAWN.x, data.player.z ?? SPAWN.z, data.player.heading ?? SPAWN.heading);
  player.health = data.player.health ?? 100;
  player.money = data.player.money ?? 0;
  if (data.mission !== undefined && missions && typeof missions.start === 'function') {
    try {
      missions.start(data.mission);
    } catch {
      // Saved mission no longer valid: start free roam instead.
    }
  }
}

function startGame() {
  if (state === 'playing') return;
  if (state === 'menu' || endShown) {
    if (saveExists && state === 'menu') applySave(saved);
    endShown = false;
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    const endScreen = document.getElementById('end-screen');
    if (endScreen) endScreen.style.display = 'none';
  }
  state = 'playing';
  game.state = state;
  hud.showMessage('Welcome to Vice Shores.');
}

function endGame(kind) {
  if (state !== 'playing') return;
  state = kind === 'mission-complete' ? 'complete' : kind;
  game.state = state;
  endShown = true;
  try {
    // Never persist a dead run: a busted/wasted save respawns Rook healthy.
    const snapshot = collectState();
    if (kind !== 'mission-complete') snapshot.player.health = 100;
    saveGame(snapshot);
  } catch {
    // Storage off: the run just ends without a save.
  }
  hud.showEnd(kind);
}

document.getElementById('start-button')?.addEventListener('click', startGame);
document.getElementById('restart-button')?.addEventListener('click', () => {
  // Full reset: a completed mission must not stay current (it would end the
  // new run on its first frame), and old heat/cruisers must not carry over.
  if (missions && typeof missions.reset === 'function') missions.reset();
  if (police && typeof police.reset === 'function') police.reset();
  for (const key of Object.keys(game.crimes)) delete game.crimes[key];
  player.setPosition(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.health = 100;
  player.money = 0;
  player.speed = 0;
  player.driving = null;
  player.busted = false;
  if (game.currentCar) {
    game.currentCar = null;
    player.setVisible(true);
  }
  hud.setHealth(100);
  hud.setMoney(0);
  hud.setWanted(0);
  hud.setObjective('Free roam — find work around Vice Shores.');
  startGame();
});
document.getElementById('start-screen')?.addEventListener('click', (event) => {
  if (event.target.id === 'start-screen') startGame();
});

if (shotName) {
  // Deterministic staged scene: the shots module positions everything and
  // raises window.__shotReady once the view has settled (~1.5 s).
  state = 'playing';
  game.state = state;
  const startScreen = document.getElementById('start-screen');
  if (startScreen) startScreen.style.display = 'none';
  applyShotParams(game);
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  if (state === 'menu') {
    menuTime += dt;
    orbitMenuCamera(camera, menuTime);
    traffic.update(dt, player.pos, 0);
    if (input.confirmPressed || input.clickPressed) startGame();
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  if (state === 'paused') {
    if (input.pausePressed || input.confirmPressed) {
      state = 'playing';
      game.state = state;
      hud.showMessage('');
    }
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  if (state !== 'playing') {
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  // --- Playing ---------------------------------------------------------------
  if (input.pausePressed) {
    state = 'paused';
    game.state = state;
    hud.showMessage('Paused — Esc to resume.');
    input.endFrame();
    renderer.render(scene, camera);
    return;
  }
  if (input.mutePressed) {
    muted = !muted;
    audio.setMuted(muted);
    hud.showMessage(muted ? 'Muted.' : 'Sound on.');
  }
  if (input.savePressed) {
    try {
      saveGame(collectState());
      hud.showMessage('Progress saved.');
    } catch {
      hud.showMessage('Could not save.');
    }
  }

  const driving = !!game.currentCar;
  const camYaw = camera.userData.yaw ?? Math.PI;

  if (driving) {
    const car = game.currentCar;
    car.update(dt, input, world, allCars());
    player.pos.copy(car.pos);
    player.heading = car.heading;
    if (input.interactPressed) {
      exitCar(player, car, world);
      game.currentCar = null;
      hud.showMessage('Out of the car.');
    }
    audio.engine(Math.min(Math.abs(car.speed) / 38, 1));
    hud.setSpeed(Math.abs(car.speed) * 3.6);
  } else {
    player.update(dt, input, world, camYaw);
    if (input.interactPressed) {
      const car = nearestCar(allCars(), player.pos, 4);
      if (car) {
        enterCar(player, car);
        game.currentCar = car;
        hud.showMessage(car.style === 'police' ? 'You stole a police cruiser!' : 'You took the car.');
        if (police.addHeat) police.addHeat(1);
      }
    }
    audio.engine(0);
    hud.setSpeed(player.speed * 3.6);
  }

  traffic.update(dt, player.pos, police.wanted || 0);
  if (police.update) police.update(dt, player, game.crimes);
  if (missions.update) missions.update(dt);
  if (combat.update) combat.update(dt, input, player, police, traffic);

  // Wanted / health / money readouts.
  hud.setHealth(Math.round(player.health));
  hud.setMoney(Math.round(player.money));
  hud.setWanted(police.wanted || 0);
  hud.setObjective(objectiveText());
  hud.drawMinimap({
    player,
    cars: traffic.cars || [],
    policeCars: police.policeCars || [],
    objective: missions && missions.current ? missions.current : null,
    world,
    bounds: CITY.halfExtent,
  });
  if (audio.siren) audio.siren((police.wanted || 0) > 0);

  // Camera follows whoever is moving: the car, or Rook on foot. Re-read the
  // car here, not the `driving` flag captured above the driving block:
  // exiting sets game.currentCar to null on this same frame, and following
  // the stale flag would pass null as the camera target and throw.
  const followTarget = game.currentCar || player;
  followCamera(camera, followTarget, dt, {
    mode: game.currentCar ? 'car' : 'foot',
    orbitYaw: input.orbitYaw,
    orbitPitch: input.orbitPitch,
  });

  // End conditions.
  if (player.health <= 0) {
    endGame('wasted');
  } else if (police.busted) {
    endGame('busted');
  } else if (missions.current && (missions.current.done || missions.current.completed)) {
    endGame('mission-complete');
  }

  renderer.render(scene, camera);
  input.endFrame();
}

requestAnimationFrame(frame);
