// Vice Shores combat: hitscan shooting from the crosshair. Click the mouse or
// press F to fire. A ray from the camera finds the first thing with a shot
// marker — a pedestrian, a traffic car or a police cruiser — and the hit does
// damage and draws heat. A muzzle flash, a tracer line and a small camera kick
// sell each shot. No external assets: everything is drawn and lit in code.
import * as THREE from 'three';

const FIRE_INTERVAL = 0.18;
const TRACER_LIFE = 0.09;
const PED_DAMAGE_HEAT = 1;
const CAR_HIT_DAMAGE = 34;
const POLICE_HIT_DAMAGE = 30;
const MISS_RANGE = 120;

export function createCombat(scene, camera, world) {
  const raycaster = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);

  // Tracer: one line, re-aimed every shot, fading out in a tenth of a second.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.frustumCulled = false;
  scene.add(tracer);
  let tracerLife = 0;

  // Muzzle flash: a warm point light that spikes and dies with the shot.
  const flash = new THREE.PointLight(0xffc36b, 0, 18);
  scene.add(flash);
  let flashLife = 0;

  let cooldown = 0;
  let queued = false;
  let kick = 0;
  let shotsFired = 0;

  // Fallback trigger for when no input object is passed to update(): the F
  // key only. Mouse clicks come through the input object (clickPressed) so a
  // click on the Start button can never queue a shot into the first frame.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyF' && !event.repeat) queued = true;
  });

  function findShotTarget(hit) {
    let node = hit.object;
    while (node) {
      if (node.userData && node.userData.shotKind) return { kind: node.userData.shotKind, ref: node.userData.ref };
      node = node.parent;
    }
    return null;
  }

  function applyHit(found, police) {
    if (!found || !found.ref) return;
    if (found.kind === 'ped') {
      const ped = found.ref;
      if (!ped.down) {
        ped.down = true;
        ped.speed = 0;
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.25;
      }
      if (police?.addHeat) police.addHeat(PED_DAMAGE_HEAT);
    } else if (found.kind === 'traffic') {
      const car = found.ref;
      car.health = (car.health ?? 100) - CAR_HIT_DAMAGE;
      if (car.health <= 0 && !car.wrecked) {
        car.wrecked = true;
        car.speed = 0;
        car.mesh.rotation.z = 0.12;
      }
      if (police?.addHeat) police.addHeat(PED_DAMAGE_HEAT);
    } else if (found.kind === 'police') {
      const car = found.ref;
      car.health = (car.health ?? 100) - POLICE_HIT_DAMAGE;
      if (car.health <= 0 && !car.disabled) {
        car.disabled = true;
        car.speed = 0;
      }
      if (police?.addHeat) police.addHeat(PED_DAMAGE_HEAT);
    }
  }

  function fire(police, traffic) {
    shotsFired += 1;
    cooldown = FIRE_INTERVAL;
    if (traffic?.alarm) traffic.alarm();

    raycaster.setFromCamera(centre, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    let end = null;
    for (const hit of hits) {
      // Ignore anything closer than the muzzle itself (camera-attached
      // geometry or the previous tracer) so a shot never hits the shooter.
      if (hit.distance < 1) continue;
      const found = findShotTarget(hit);
      if (!found) continue;
      end = hit.point;
      applyHit(found, police);
      break;
    }
    if (!end) {
      end = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(MISS_RANGE));
    }

    // Tracer from the muzzle (just under the camera) to the impact point.
    const start = camera.position.clone();
    start.y -= 0.25;
    const positions = tracerGeo.attributes.position.array;
    positions[0] = start.x;
    positions[1] = start.y;
    positions[2] = start.z;
    positions[3] = end.x;
    positions[4] = end.y;
    positions[5] = end.z;
    tracerGeo.attributes.position.needsUpdate = true;
    tracerMat.opacity = 0.9;
    tracerLife = TRACER_LIFE;

    flash.position.copy(start);
    flash.intensity = 2.4;
    flashLife = 0.06;

    camera.rotation.x += 0.025;
    kick += 0.025;
  }

  function update(dt, input, player, police, traffic) {
    if (cooldown > 0) cooldown -= dt;

    // Shots come from the main loop's input object — held F (shootHeld), a
    // fresh canvas click (clickPressed), or a one-shot F press — plus the
    // fallback key listener above and a plain `shoot` flag / consumeShot().
    let wantShot = queued;
    queued = false;
    if (input) {
      if (typeof input.consumeShot === 'function' && input.consumeShot()) wantShot = true;
      else if (input.shootHeld || input.clickPressed || input.shoot) wantShot = true;
      else if (typeof input.pressed === 'function' && input.pressed('KeyF')) wantShot = true;
    }
    if (wantShot && cooldown <= 0) fire(police, traffic);

    if (tracerLife > 0) {
      tracerLife -= dt;
      tracerMat.opacity = Math.max(0, (tracerLife / TRACER_LIFE) * 0.9);
    }
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) flash.intensity = 0;
    }
    if (kick > 0) {
      const unwind = Math.min(kick, kick * 8 * dt + 0.001);
      camera.rotation.x -= unwind;
      kick -= unwind;
    }
  }

  return {
    update,
    fire,
    get shotsFired() {
      return shotsFired;
    },
  };
}
