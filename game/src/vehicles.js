// Cars: box-built models in four styles (sedan, taxi, pickup, police) with
// arcade driving physics — accelerate, brake/reverse, speed-scaled steering,
// handbrake — plus building collision and simple car-to-car push-apart.
import * as THREE from 'three';
import { CAR, CITY } from './config.js';
import { circleHits } from './world.js';

const STYLE_DEFAULTS = {
  sedan: { body: 0x4a7fb5, cabin: 0x223344, wheels: 0x1a1a1a },
  taxi: { body: 0xf2c230, cabin: 0x223344, wheels: 0x1a1a1a },
  pickup: { body: 0xb5503c, cabin: 0x223344, wheels: 0x1a1a1a },
  police: { body: 0x181c22, cabin: 0xe8e8e8, wheels: 0x1a1a1a },
};

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.5,
    metalness: opts.metalness ?? 0.35,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function buildCarModel(style, color) {
  const palette = STYLE_DEFAULTS[style] || STYLE_DEFAULTS.sedan;
  const bodyColor = color ?? palette.body;
  const group = new THREE.Group();
  const wheels = [];
  const frontWheels = [];

  // Lower body + cabin; the pickup gets an open bed instead of a rear cabin.
  group.add(box(1.9, 0.55, 4.3, bodyColor, 0, 0.55, 0));
  if (style === 'pickup') {
    group.add(box(1.7, 0.5, 1.5, palette.cabin, 0, 1.05, 0.85));
    group.add(box(1.9, 0.35, 1.9, bodyColor, 0, 0.95, -1.1));
    group.add(box(0.1, 0.4, 1.9, bodyColor, -0.9, 1.0, -1.1));
    group.add(box(0.1, 0.4, 1.9, bodyColor, 0.9, 1.0, -1.1));
  } else {
    group.add(box(1.65, 0.55, 2.1, palette.cabin, 0, 1.08, style === 'police' ? 0.1 : -0.15));
  }
  // Headlights and taillights.
  group.add(box(0.34, 0.14, 0.06, 0xfff6c8, -0.62, 0.62, 2.16, { emissive: 0xfff2a0, emissiveIntensity: 0.7 }));
  group.add(box(0.34, 0.14, 0.06, 0xfff6c8, 0.62, 0.62, 2.16, { emissive: 0xfff2a0, emissiveIntensity: 0.7 }));
  group.add(box(0.34, 0.14, 0.06, 0xd9382c, -0.62, 0.62, -2.16, { emissive: 0xd9382c, emissiveIntensity: 0.5 }));
  group.add(box(0.34, 0.14, 0.06, 0xd9382c, 0.62, 0.62, -2.16, { emissive: 0xd9382c, emissiveIntensity: 0.5 }));

  if (style === 'taxi') {
    group.add(box(0.9, 0.22, 0.4, 0xf2c230, 0, 1.48, -0.15, { emissive: 0xffe27a, emissiveIntensity: 0.8 }));
  }
  if (style === 'police') {
    group.add(box(0.9, 0.16, 0.4, 0xff2a2a, -0.25, 1.42, 0.1, { emissive: 0xff2020, emissiveIntensity: 1.4 }));
    group.add(box(0.9, 0.16, 0.4, 0x2a5cff, 0.25, 1.42, 0.1, { emissive: 0x2040ff, emissiveIntensity: 1.4 }));
    group.add(box(1.7, 0.1, 0.5, 0xf5f5f5, 0, 0.86, 0));
  }

  // Wheels: cylinders turned on their side, front pair steers.
  for (const [wx, wz, front] of [[-0.85, 1.35, true], [0.85, 1.35, true], [-0.85, -1.35, false], [0.85, -1.35, false]]) {
    const pivot = new THREE.Group();
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12),
      new THREE.MeshStandardMaterial({ color: palette.wheels, roughness: 0.9 }),
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    pivot.position.set(wx, 0.36, wz);
    group.add(pivot);
    wheels.push(wheel);
    if (front) frontWheels.push(pivot);
  }

  return { group, wheels, frontWheels };
}

/**
 * Create a car entity and add it to the scene.
 * `style` is 'sedan' | 'taxi' | 'pickup' | 'police'; `color` overrides the
 * style's default body colour. `pos` is { x, z, heading }.
 */
export function createCar(scene, style, pos, color) {
  const { group, wheels, frontWheels } = buildCarModel(style, color);
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = pos.heading ?? 0;
  scene.add(group);

  const car = {
    group,
    mesh: group,
    pos: group.position,
    heading: pos.heading ?? 0,
    speed: 0,
    steer: 0,
    style,
    radius: CAR.radius,
    wheels,
    frontWheels,

    /**
     * Arcade driving. `input` may be null (coasting, e.g. a parked car).
     * `others` is the list of nearby cars for push-apart collision.
     */
    update(dt, input, world, others) {
      const throttle = input ? input.moveY : 0;
      const steerInput = input ? input.moveX : 0;
      const handbrake = input ? input.brake : false;

      const speedFactor = Math.min(Math.abs(car.speed) / CAR.maxSpeed, 1);
      const steerTarget = steerInput * CAR.steerMax * (1 - speedFactor * 0.55) * (handbrake ? 1.35 : 1);
      car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);

      if (throttle > 0) car.speed += CAR.accel * dt;
      else if (throttle < 0) {
        if (car.speed > 0.5) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.accel * 0.7 * dt;
      } else {
        car.speed -= car.speed * CAR.drag * dt;
        if (Math.abs(car.speed) < 0.05) car.speed = 0;
      }
      if (handbrake) {
        car.speed -= car.speed * 4.5 * dt;
      }
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));

      if (Math.abs(car.speed) > 0.01) {
        car.heading += (car.speed / CAR.wheelBase) * Math.tan(car.steer) * dt;
      }

      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      const step = car.speed * dt;
      const tryX = car.pos.x + fwdX * step;
      const tryZ = car.pos.z + fwdZ * step;
      const colliders = world.colliders;
      if (!circleHits(tryX, car.pos.z, car.radius, colliders)) car.pos.x = tryX;
      else car.speed *= -0.25;
      if (!circleHits(car.pos.x, tryZ, car.radius, colliders)) car.pos.z = tryZ;
      else car.speed *= -0.25;
      car.pos.x = Math.max(-CITY.bound, Math.min(CITY.bound, car.pos.x));
      car.pos.z = Math.max(-CITY.bound, Math.min(CITY.bound, car.pos.z));

      // Push apart from other cars (simple circle overlap).
      if (others) {
        for (const other of others) {
          if (other === car) continue;
          const dx = car.pos.x - other.pos.x;
          const dz = car.pos.z - other.pos.z;
          const d2 = dx * dx + dz * dz;
          const minD = car.radius + other.radius;
          if (d2 > 0.0001 && d2 < minD * minD) {
            const d = Math.sqrt(d2);
            const push = (minD - d) / 2;
            const nx = dx / d;
            const nz = dz / d;
            car.pos.x += nx * push;
            car.pos.z += nz * push;
            other.pos.x -= nx * push;
            other.pos.z -= nz * push;
            const swap = car.speed * 0.5;
            car.speed = other.speed * 0.5;
            other.speed = swap;
          }
        }
      }
      group.rotation.y = car.heading;
      for (const wheel of wheels) wheel.rotation.x += (car.speed * dt) / 0.36;
      for (const pivot of frontWheels) pivot.rotation.y = car.steer;
    },
  };
  return car;
}

/** Nearest car within maxDist of a position, or null. */
export function nearestCar(cars, pos, maxDist) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const car of cars) {
    const dx = car.pos.x - pos.x;
    const dz = car.pos.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = car;
    }
  }
  return best;
}

/** Hide the player inside the car; the player rides along with it. */
export function enterCar(player, car) {
  player.setVisible(false);
  player.driving = car;
  player.pos.copy(car.pos);
  player.heading = car.heading;
}

/** Put the player back on foot beside the car. */
export function exitCar(player, car, world) {
  const sideX = Math.cos(car.heading);
  const sideZ = -Math.sin(car.heading);
  let x = car.pos.x + sideX * 2.8;
  let z = car.pos.z + sideZ * 2.8;
  if (world && circleHits(x, z, player.radius, world.colliders)) {
    x = car.pos.x - sideX * 2.8;
    z = car.pos.z - sideZ * 2.8;
  }
  player.driving = null;
  player.setPosition(x, z, car.heading);
  player.setVisible(true);
}
