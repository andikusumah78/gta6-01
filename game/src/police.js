// Vice Shores police: the wanted system and the black-and-white pursuit cars.
// Wanted runs 0-5 stars. Heat brings one cruiser per star, spawned at the city
// edges; cruisers chase and ram the player. Stay clean for 8 seconds and the heat
// starts to cool off, one star at a time. Caught on foot, or wrecked while wanted,
// and Rook is busted.
import * as THREE from 'three';

const CITY_HALF = 245;
const MAX_WANTED = 5;
// Seconds of no crime before the heat starts cooling, then seconds per star lost.
const QUIET_BEFORE_DECAY = 8;
const DECAY_EVERY = 6;
// Caught on foot this close to a cruiser, the run is over.
const BUST_DISTANCE = 2.4;

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

function playerInCar(player) {
  return Boolean(player?.inCar || player?.driving || player?.car);
}

function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > maxStep) return current + maxStep;
  if (diff < -maxStep) return current - maxStep;
  return target;
}

export function createPolice(scene, world, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const half = world?.bounds ?? world?.halfSize ?? CITY_HALF;

  let heat = 0;
  let quietTimer = 0;
  let decayTimer = 0;
  let flashTime = 0;
  const policeCars = [];

  function buildPoliceMesh() {
    const group = new THREE.Group();
    const black = new THREE.MeshLambertMaterial({ color: 0x14161a });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
    const tyre = new THREE.MeshLambertMaterial({ color: 0x111111 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 4.1), black);
    body.position.y = 0.55;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), white);
    cabin.position.set(0, 1.1, -0.2);
    group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10);
    for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
      const wheel = new THREE.Mesh(wheelGeo, tyre);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.34, z);
      group.add(wheel);
    }

    // Light bar: red on the left, blue on the right, flashing in turns.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4), black);
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xcc2222, emissiveIntensity: 1 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244cc, emissive: 0x2244cc, emissiveIntensity: 0.15 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.34), redMat);
    red.position.set(-0.32, 1.45, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.34), blueMat);
    blue.position.set(0.32, 1.45, -0.2);
    group.add(blue);
    return { group, redMat, blueMat };
  }

  function edgeSpawn() {
    const side = Math.floor(random() * 4);
    const along = -half + random() * half * 2;
    if (side === 0) return { x: along, z: -half };
    if (side === 1) return { x: along, z: half };
    if (side === 2) return { x: -half, z: along };
    return { x: half, z: along };
  }

  function spawnCar() {
    const at = edgeSpawn();
    const { group, redMat, blueMat } = buildPoliceMesh();
    group.position.set(at.x, 0, at.z);
    const car = {
      mesh: group,
      // pos aliases the mesh position, and radius matches the driving model:
      // the main loop pushes the player's car apart from cruisers by these.
      pos: group.position,
      radius: 1.7,
      x: at.x,
      z: at.z,
      heading: 0,
      speed: 0,
      health: 100,
      disabled: false,
      redMat,
      blueMat,
    };
    group.userData.shotKind = 'police';
    group.userData.ref = car;
    scene.add(group);
    policeCars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const index = policeCars.indexOf(car);
    if (index >= 0) policeCars.splice(index, 1);
  }

  function addHeat(n) {
    if (!n) return;
    heat = Math.min(MAX_WANTED, Math.max(0, heat + n));
    quietTimer = 0;
    decayTimer = 0;
  }

  function bust(player) {
    // The bust is delivered three ways: the flag the main loop reads every
    // frame, the hook main.js may assign, and a flag on the player itself.
    api.busted = true;
    if (typeof api.onBusted === 'function') api.onBusted();
    if (player && typeof player === 'object') player.busted = true;
  }

  function update(dt, player, crimes) {
    // A bust lasts until the main loop reads it. Clear it at the top of every
    // update so a restart does not re-bust Rook on the first frame back.
    api.busted = false;
    flashTime += dt;
    // `crimes` is the shared game.crimes object: an empty object means no new
    // crime (it is always truthy as a value, so test its contents instead).
    const crimeNow = crimes === true
      || (typeof crimes === 'number' && crimes > 0)
      || (crimes && typeof crimes === 'object' && Object.keys(crimes).length > 0);
    if (crimeNow) {
      quietTimer = 0;
      decayTimer = 0;
    } else if (heat > 0) {
      quietTimer += dt;
      if (quietTimer > QUIET_BEFORE_DECAY) {
        decayTimer += dt;
        if (decayTimer >= DECAY_EVERY) {
          decayTimer = 0;
          heat = Math.max(0, heat - 1);
          const last = policeCars[policeCars.length - 1];
          if (last) removeCar(last);
        }
      }
    }

    while (policeCars.length < heat) spawnCar();
    while (policeCars.length > heat) removeCar(policeCars[policeCars.length - 1]);

    const target = readPos(player);
    const inCar = playerInCar(player);
    const on = Math.floor(flashTime * 4) % 2 === 0;

    for (const car of policeCars) {
      // A disabled cruiser goes dark instead of flashing.
      car.redMat.emissiveIntensity = car.disabled ? 0.1 : (on ? 1 : 0.15);
      car.blueMat.emissiveIntensity = car.disabled ? 0.1 : (on ? 0.15 : 1);
      if (car.disabled) continue;

      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      car.heading = turnToward(car.heading, wantHeading, 2.4 * dt);
      const cruise = Math.min(24, 15 + heat * 1.6);
      // Close in fast, then match the player's pace to lean on them.
      const speed = dist > 12 ? cruise : cruise * 0.55;
      car.speed = speed;
      car.x += Math.sin(car.heading) * speed * dt;
      car.z += Math.cos(car.heading) * speed * dt;
      car.x = Math.max(-half, Math.min(half, car.x));
      car.z = Math.max(-half, Math.min(half, car.z));
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;

      if (dist < BUST_DISTANCE && !inCar) {
        bust(player);
      } else if (dist < 3.5 && inCar && typeof player.health === 'number') {
        // Ramming wears the getaway car down; wreck it while wanted and it is over.
        player.health = Math.max(0, player.health - 8 * dt);
        if (player.health <= 0) bust(player);
      }
    }
  }

  const api = {
    get wanted() {
      return heat;
    },
    // True on the frame Rook is caught; the main loop ends the run on it.
    busted: false,
    policeCars,
    addHeat,
    update,
    // Assigned by main.js: called the moment Rook is busted.
    onBusted: null,
  };
  return api;
}
