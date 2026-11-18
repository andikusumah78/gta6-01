// Rendering only: the WebGL renderer, the scene and camera, and the third-person
// follow camera. Nothing here knows about missions, police or the game state.
import * as THREE from 'three';
import { CAMERA, COLORS } from './config.js';

/** Create the renderer, scene and camera for the given full-screen canvas. */
export function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 260, 640);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 32, 70);
  camera.userData.yaw = Math.PI;
  camera.userData.snapped = false;

  function onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, onResize };
}

/**
 * Third-person follow camera. `target` is { pos: THREE.Vector3, heading }.
 * `mode` is 'foot' or 'car'. `orbitYaw`/`orbitPitch` come from mouse drag and
 * rotate the view around the target. The camera's horizontal look direction is
 * stored on camera.userData.yaw so on-foot movement can be camera-relative.
 */
export function followCamera(camera, target, dt, options = {}) {
  const mode = options.mode || 'foot';
  const orbitYaw = options.orbitYaw || 0;
  const orbitPitch = options.orbitPitch || 0;
  const distance = mode === 'car' ? CAMERA.carDistance : CAMERA.footDistance;
  const height = mode === 'car' ? CAMERA.carHeight : CAMERA.footHeight;

  // Camera sits behind the target: opposite its heading, plus the orbit offset.
  const yaw = target.heading + Math.PI + orbitYaw;
  const backX = Math.sin(yaw);
  const backZ = Math.cos(yaw);
  const desired = new THREE.Vector3(
    target.pos.x + backX * distance,
    target.pos.y + height + orbitPitch * distance * 0.4,
    target.pos.z + backZ * distance,
  );

  if (!camera.userData.snapped || options.snap) {
    camera.position.copy(desired);
    camera.userData.snapped = true;
  } else {
    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    camera.position.lerp(desired, k);
  }

  const look = new THREE.Vector3(
    target.pos.x - backX * CAMERA.lookAhead,
    target.pos.y + CAMERA.lookHeight,
    target.pos.z - backZ * CAMERA.lookAhead,
  );
  camera.lookAt(look);

  // Horizontal direction the camera is looking, for camera-relative movement.
  const dirX = look.x - camera.position.x;
  const dirZ = look.z - camera.position.z;
  camera.userData.yaw = Math.atan2(dirX, dirZ);
}

/** Slow cinematic orbit used on the start screen. */
export function orbitMenuCamera(camera, time) {
  const radius = CAMERA.menuRadius;
  camera.position.set(Math.sin(time * 0.045) * radius, CAMERA.menuHeight, Math.cos(time * 0.045) * radius - 20);
  camera.lookAt(0, 4, 0);
  camera.userData.snapped = false;
}
