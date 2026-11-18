// Vice Shores traffic: civilian cars looping the road rectangles and pedestrians
// walking the sidewalks. Cars slow down near the player; pedestrians flee when the
// heat is on (wanted level 3 or more) or when shots are fired nearby.
import * as THREE from 'three';

// The city grid, taken from Builder A's world when it is available: roads on
// seven lines per axis, 74 m apart, across a 490 m square. The defaults match
// config.js exactly (roadLines, bound) and are only a fallback.
const DEFAULT_LINES = [-222, -148, -74, 0, 74, 148, 222];
const CITY_HALF = 245;
const PITCH = 74;
const CAR_COUNT = 10;
const PED_COUNT = 14;

const CAR_PAINT = [0xd8d8d8, 0x3a6fd8, 0xd83a3a, 0x3ad86f, 0xe8c33a, 0x8a5ad8, 0xdddddd, 0x2a2f38];
const SHIRT_COLORS = [0xe8e8e8, 0x3a6fd8, 0xd83a3a, 0x3ad86f, 0xe8c33a, 0x8a5ad8, 0xff8c42];

function roadLines(world) {
  if (Array.isArray(world?.roadNetwork?.lines) && world.roadNetwork.lines.length > 0) return world.roadNetwork.lines;
  if (Array.isArray(world?.roads) && world.roads.length > 0) return world.roads;
  return DEFAULT_LINES;
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** A lightweight box-built car, in the same style as the player's cars. */
function buildCarMesh(rng) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: pick(rng, CAR_PAINT) });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 4.1), paint);
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glass);
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10);
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.34, z);
    group.add(wheel);
  }

  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x554400 });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), lightMat);
    lamp.position.set(x, 0.6, 2.06);
    group.add(lamp);
  }
  return group;
}

/** A simple walking pedestrian: torso, head and legs, shirt colour varied. */
function buildPedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRT_COLORS) });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.28), pants);
  legs.position.y = 0.35;
  group.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.75, 0.3), shirt);
  torso.position.y = 1.05;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  group.add(head);
  return group;
}

function readPos(pos) {
  if (!pos) return { x: 0, z: 0 };
  if (typeof pos.x === 'number' && typeof pos.z === 'number') return { x: pos.x, z: pos.z };
  if (pos.position && typeof pos.position.x === 'number') return { x: pos.position.x, z: pos.position.z };
  if (pos.pos && typeof pos.pos.x === 'number') return { x: pos.pos.x, z: pos.pos.z };
  return { x: 0, z: 0 };
}

export function createTraffic(scene, world, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const lines = roadLines(world);
  const half = world?.bounds ?? world?.halfSize ?? CITY_HALF;

  const cars = [];
  for (let i = 0; i < CAR_COUNT; i += 1) {
    const xs = [pick(random, lines), pick(random, lines)].sort((a, b) => a - b);
    const zs = [pick(random, lines), pick(random, lines)].sort((a, b) => a - b);
    const rect = {
      minX: Math.min(xs[0], xs[1]),
      maxX: Math.max(xs[0], xs[1]),
      minZ: Math.min(zs[0], zs[1]),
      maxZ: Math.max(zs[0], zs[1]),
    };
    if (rect.maxX - rect.minX < PITCH) rect.maxX = rect.minX + PITCH;
    if (rect.maxZ - rect.minZ < PITCH) rect.maxZ = rect.minZ + PITCH;
    const mesh = buildCarMesh(random);
    mesh.userData.shotKind = 'traffic';
    const car = {
      mesh,
      // pos aliases the mesh position, and radius matches the driving model:
      // the main loop pushes the player's car apart from traffic by these.
      pos: mesh.position,
      radius: 1.7,
      rect,
      edge: Math.floor(random() * 4),
      s: random() * 100,
      speed: 8 + random() * 6,
      health: 100,
      wrecked: false,
    };
    mesh.userData.ref = car;
    scene.add(mesh);
    // Park the mesh on its road at once, so the first frame already shows
    // traffic instead of a pile of cars at the origin.
    const at = carPosition(car);
    mesh.position.set(at.x, 0, at.z);
    mesh.rotation.y = Math.atan2(at.dx, at.dz);
    cars.push(car);
  }

  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const alongRoad = random() < 0.5;
    const road = pick(random, lines);
    const mesh = buildPedMesh(random);
    mesh.userData.shotKind = 'ped';
    const ped = {
      mesh,
      alongRoad,
      road,
      offset: (random() < 0.5 ? -1 : 1) * 8.5,
      pos: -half + random() * half * 2,
      dir: random() < 0.5 ? -1 : 1,
      speed: 1.2 + random() * 1.0,
      fleeing: false,
      fleeUntil: 0,
      down: false,
      walkPhase: random() * Math.PI * 2,
    };
    mesh.userData.ref = ped;
    scene.add(mesh);
    peds.push(ped);
  }

  let alarmUntil = 0;
  let elapsed = 0;

  /** Shots fired nearby: pedestrians run. Called by combat on every shot. */
  function alarm() {
    alarmUntil = elapsed + 3;
  }

  function carPosition(car) {
    const { rect } = car;
    const per = 2 * (rect.maxX - rect.minX) + 2 * (rect.maxZ - rect.minZ);
    let s = ((car.s % per) + per) % per;
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    if (s < w) return { x: rect.minX + s, z: rect.minZ, dx: 1, dz: 0 };
    s -= w;
    if (s < d) return { x: rect.maxX, z: rect.minZ + s, dx: 0, dz: 1 };
    s -= d;
    if (s < w) return { x: rect.maxX - s, z: rect.maxZ, dx: -1, dz: 0 };
    s -= w;
    return { x: rect.minX, z: rect.maxZ - s, dx: 0, dz: -1 };
  }

  function update(dt, playerPos, wanted) {
    elapsed += dt;
    const player = readPos(playerPos);
    const alarmed = elapsed < alarmUntil;

    for (const car of cars) {
      if (car.wrecked) continue;
      const at = carPosition(car);
      const dx = at.x - player.x;
      const dz = at.z - player.z;
      const dist = Math.hypot(dx, dz);
      // Ease off the gas in traffic near the player, so the streets feel alive
      // instead of ramming the player from behind.
      const slow = dist < 30 ? 0.3 : 1;
      car.s += car.speed * slow * dt;
      const next = carPosition(car);
      car.mesh.position.set(next.x, 0, next.z);
      car.mesh.rotation.y = Math.atan2(next.dx, next.dz);
    }

    const scared = wanted >= 3 || alarmed;
    for (const ped of peds) {
      if (ped.down) continue;
      const px = ped.alongRoad ? ped.pos : ped.road + ped.offset;
      const pz = ped.alongRoad ? ped.road + ped.offset : ped.pos;
      const dx = px - player.x;
      const dz = pz - player.z;
      const dist = Math.hypot(dx, dz);
      if (scared && dist < 45) {
        ped.fleeing = true;
        ped.fleeUntil = elapsed + 4;
        // Run away from the player along the sidewalk.
        ped.dir = ped.alongRoad ? (dx >= 0 ? 1 : -1) : (dz >= 0 ? 1 : -1);
      } else if (elapsed > ped.fleeUntil) {
        ped.fleeing = false;
      }
      const speed = ped.fleeing ? ped.speed * 2.6 : ped.speed;
      ped.pos += ped.dir * speed * dt;
      if (ped.pos > half) {
        ped.pos = half;
        ped.dir = -1;
      } else if (ped.pos < -half) {
        ped.pos = -half;
        ped.dir = 1;
      }
      const x = ped.alongRoad ? ped.pos : ped.road + ped.offset;
      const z = ped.alongRoad ? ped.road + ped.offset : ped.pos;
      ped.walkPhase += dt * (ped.fleeing ? 11 : 6);
      ped.mesh.position.set(x, Math.abs(Math.sin(ped.walkPhase)) * 0.06, z);
      ped.mesh.rotation.y = ped.alongRoad
        ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (ped.dir > 0 ? 0 : Math.PI);
    }
  }

  return { cars, peds, update, alarm };
}
