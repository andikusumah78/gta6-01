// Vice Shores screenshot scenes behind ?shot=start|drive|chase|mission (with
// &seed=N). Each one stages a deterministic frame of the real game — the start
// screen, Rook driving mid-street, a three-star chase, or mission 2 with its
// objective marker and the package waiting at the Docks — then sets
// window.__shotReady after ~1.5 s of settling so the recorder knows the frame
// is ready. Unknown shot names fall back to the start screen.
import { loadGame } from './save.js';
import { createCar, enterCar } from './vehicles.js';

const SETTLE_MS = 1500;

function readPos(player) {
  if (!player) return { x: 0, z: 0 };
  if (typeof player.x === 'number' && typeof player.z === 'number') return { x: player.x, z: player.z };
  if (player.position && typeof player.position.x === 'number') return { x: player.position.x, z: player.position.z };
  if (player.pos && typeof player.pos.x === 'number') return { x: player.pos.x, z: player.pos.z };
  if (player.mesh?.position && typeof player.mesh.position.x === 'number') {
    return { x: player.mesh.position.x, z: player.mesh.position.z };
  }
  return { x: 0, z: 0 };
}

function setPlayerPos(player, x, z) {
  if (!player) return;
  if (player.position?.set) player.position.set(x, 0, z);
  else if (player.mesh?.position?.set) player.mesh.position.set(x, 0, z);
  else {
    player.x = x;
    player.z = z;
  }
  if (player.pos && typeof player.pos === 'object') {
    player.pos.x = x;
    player.pos.z = z;
  }
}

function putPlayerInCar(game, x, z) {
  const { player } = game;
  if (!player) return;
  // Spawn a real car through the vehicles module and put Rook in it: the
  // main loop drives off game.currentCar, so the shot has to set that too.
  const heading = Math.PI / 2;
  let car = null;
  if (game.scene && typeof createCar === 'function') {
    car = createCar(game.scene, 'sedan', { x, z, heading });
    if (typeof enterCar === 'function') enterCar(player, car);
  }
  if (car) {
    game.currentCar = car;
    car.speed = 15;
    player.heading = heading;
  } else {
    // Fallback when there is no scene to spawn into: record the driving
    // state directly on the player object.
    setPlayerPos(player, x, z);
    player.inCar = true;
    player.driving = true;
    player.car = null;
    player.speed = 15;
    if (typeof player.heading === 'number') player.heading = heading;
  }
}

function refreshHud(game) {
  const { hud, player, police, missions, traffic } = game;
  if (!hud) return;
  if (typeof player?.money === 'number' && hud.setMoney) hud.setMoney(player.money);
  if (typeof player?.health === 'number' && hud.setHealth) hud.setHealth(player.health);
  if (police && hud.setWanted) hud.setWanted(police.wanted);
  // Speed is shown in km/h: the car (or the player on foot) reports m/s.
  if (hud.setSpeed) {
    const speedMs = game.currentCar?.speed ?? (typeof player?.speed === 'number' ? player.speed : 0);
    hud.setSpeed(speedMs * 3.6);
  }
  if (hud.drawMinimap) {
    hud.drawMinimap({
      playerPos: { ...readPos(player), heading: player?.heading ?? 0 },
      police: police?.policeCars ?? [],
      marker: missions?.marker ?? null,
      traffic: traffic?.cars ?? [],
    });
  }
}

/**
 * Stage one of the four screenshot scenes on the assembled game object and
 * return its name. `game` is { player, hud, audio, save, world, police,
 * traffic, missions, vehicles?, camera?, scene? } as wired by main.js.
 */
export function applyShotParams(game) {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot') || 'start';
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 1;
  window.__viceShot = shot;
  window.__viceSeed = seed;

  const { hud, police, missions, player } = game;

  if (shot === 'drive') {
    // Mid-street on a road intersection (x = 0 and z = -74 are both roads).
    putPlayerInCar(game, 0, -74);
    if (player && typeof player.money !== 'number') player.money = 250;
    if (hud?.setObjective) hud.setObjective('Cruise Vice Shores — find your next job.');
  } else if (shot === 'chase') {
    putPlayerInCar(game, 0, -74);
    if (player && typeof player.money !== 'number') player.money = 250;
    if (police?.addHeat) police.addHeat(3);
    // Cruisers only spawn inside police.update, so run one tick now to
    // create them — otherwise the line-up below would position nothing and
    // the shot would show an empty road behind Rook.
    if (police?.update) police.update(0.016, player, {});
    // Line the three cruisers up AHEAD of Rook's car, in pursuit: the chase
    // camera sits behind Rook looking forward, so cruisers staged behind
    // him would be behind the camera and invisible. Ahead, staggered across
    // the lanes with their light bars flashing, they read as a chase.
    const at = readPos(player);
    (police?.policeCars ?? []).forEach((car, i) => {
      car.x = at.x + 16 + i * 10;
      car.z = at.z + (i - 1) * 5;
      car.heading = Math.PI / 2;
      if (car.mesh?.position?.set) car.mesh.position.set(car.x, 0, car.z);
      if (car.mesh) car.mesh.rotation.y = car.heading;
    });
    if (hud?.setObjective) hud.setObjective('Lose the heat — 3 stars on your tail.');
  } else if (shot === 'mission') {
    // On a sunny stretch of the z = 74 road, in the car, with mission 2
    // already active. (The Docks end of the city sits in a tall building's
    // shadow, which left the first take of this shot nearly black.)
    putPlayerInCar(game, 0, 74);
    if (missions?.start) missions.start(1);
    if (hud?.setObjective) hud.setObjective('Collect the package at the Docks, then drop to 1 star.');
  } else {
    // start (and any unknown name): the title screen, with Continue when a save exists.
    const saveExists = (() => {
      try {
        if (game.save?.loadGame) return game.save.loadGame() !== null;
        return loadGame() !== null;
      } catch {
        return false;
      }
    })();
    if (hud?.showStart) hud.showStart(saveExists);
  }

  refreshHud(game);

  // Let the scene settle (traffic moving, lights flashing, minimap drawn), then
  // tell the recorder the frame is ready.
  window.setTimeout(() => {
    refreshHud(game);
    window.__shotReady = true;
  }, SETTLE_MS);

  return shot;
}
