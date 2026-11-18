// Rook Marlowe on foot: a simple box-built figure (teal shirt, dark trousers,
// red cap) with a walk swing. Movement is camera-relative; buildings block
// with a sliding circle collision.
import * as THREE from 'three';
import { CITY, COLORS, PLAYER } from './config.js';
import { circleHits } from './world.js';

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Create the on-foot player and add it to the scene. */
export function createPlayer(scene) {
  const group = new THREE.Group();

  const legL = box(0.2, 0.8, 0.22, COLORS.playerPants, -0.14, 0.4, 0);
  const legR = box(0.2, 0.8, 0.22, COLORS.playerPants, 0.14, 0.4, 0);
  const torso = box(0.62, 0.68, 0.34, COLORS.playerShirt, 0, 1.14, 0);
  const armL = box(0.16, 0.62, 0.18, COLORS.playerShirt, -0.4, 1.16, 0);
  const armR = box(0.16, 0.62, 0.18, COLORS.playerShirt, 0.4, 1.16, 0);
  const head = box(0.34, 0.34, 0.32, COLORS.playerSkin, 0, 1.66, 0);
  const cap = box(0.38, 0.1, 0.36, COLORS.playerCap, 0, 1.86, 0);
  const brim = box(0.36, 0.05, 0.18, COLORS.playerCap, 0, 1.82, 0.24);
  group.add(legL, legR, torso, armL, armR, head, cap, brim);

  group.position.set(0, 0, 20);
  scene.add(group);

  const player = {
    group,
    mesh: group,
    pos: group.position,
    heading: Math.PI,
    speed: 0,
    health: PLAYER.maxHealth,
    money: 0,
    moving: false,
    walkPhase: 0,
    visible: true,
    radius: PLAYER.radius,

    setPosition(x, z, heading) {
      group.position.set(x, 0, z);
      if (heading !== undefined) {
        player.heading = heading;
        group.rotation.y = heading;
      }
    },
    setVisible(value) {
      player.visible = value;
      group.visible = value;
    },
    takeDamage(amount) {
      player.health = Math.max(0, player.health - amount);
      return player.health;
    },
    heal(amount) {
      player.health = Math.min(PLAYER.maxHealth, player.health + amount);
      return player.health;
    },

    /**
     * Camera-relative WASD movement. `camYaw` is the camera's horizontal look
     * direction (radians, atan2 of x/z). Collides with building AABBs and the
     * city bounds, sliding along walls.
     */
    update(dt, input, world, camYaw) {
      const fwdX = Math.sin(camYaw);
      const fwdZ = Math.cos(camYaw);
      // Right = forward x up (y-up cross product).
      const rightX = -Math.cos(camYaw);
      const rightZ = Math.sin(camYaw);

      let mx = fwdX * input.moveY + rightX * input.moveX;
      let mz = fwdZ * input.moveY + rightZ * input.moveX;
      const len = Math.hypot(mx, mz);
      player.moving = len > 0.01;
      if (player.moving) {
        mx /= len;
        mz /= len;
        const targetSpeed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
        // Exponential approach to the target speed: quick to start, no overshoot.
        player.speed += (targetSpeed - player.speed) * Math.min(1, 8 * dt);
        const targetHeading = Math.atan2(mx, mz);
        let diff = targetHeading - player.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.heading += diff * Math.min(1, 12 * dt);
      } else {
        player.speed = Math.max(0, player.speed - PLAYER.accel * dt);
      }

      const step = player.speed * dt;
      const nx = player.pos.x + mx * step;
      const nz = player.pos.z + mz * step;
      const colliders = world.colliders;
      // Axis-separated movement: slide along a wall instead of sticking to it.
      if (!circleHits(nx, player.pos.z, player.radius, colliders)) player.pos.x = nx;
      if (!circleHits(player.pos.x, nz, player.radius, colliders)) player.pos.z = nz;
      player.pos.x = Math.max(-CITY.bound, Math.min(CITY.bound, player.pos.x));
      player.pos.z = Math.max(-CITY.bound, Math.min(CITY.bound, player.pos.z));

      group.rotation.y = player.heading;
      if (player.moving && player.speed > 0.5) {
        player.walkPhase += dt * player.speed * 1.6;
        const swing = Math.sin(player.walkPhase) * 0.55;
        legL.rotation.x = swing;
        legR.rotation.x = -swing;
        armL.rotation.x = -swing * 0.8;
        armR.rotation.x = swing * 0.8;
        group.position.y = Math.abs(Math.sin(player.walkPhase)) * 0.05;
      } else {
        legL.rotation.x = 0;
        legR.rotation.x = 0;
        armL.rotation.x = 0;
        armR.rotation.x = 0;
        group.position.y = 0;
      }
    },
  };
  return player;
}
