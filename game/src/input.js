// Keyboard and pointer input. Held keys are read every frame; one-shot presses
// (interact, save, mute, pause, confirm) land in a `fresh` set that the loop
// consumes once per frame via endFrame(), so a press between frames is never
// lost and never counted twice.
import { KEYS } from './config.js';

function has(list, code) {
  return list.indexOf(code) !== -1;
}

export function createInput(canvas) {
  const keys = new Set();
  const fresh = new Set();
  let orbitYaw = 0;
  let orbitPitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    fresh.add(event.code);
    // Don't scroll the page with game keys.
    if (
      has(KEYS.up, event.code) || has(KEYS.down, event.code)
      || has(KEYS.left, event.code) || has(KEYS.right, event.code)
      || event.code === 'Space'
    ) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of all.
  window.addEventListener('blur', () => {
    keys.clear();
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    fresh.add('MouseClick');
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitYaw -= (event.clientX - lastX) * 0.005;
    orbitPitch += (event.clientY - lastY) * 0.004;
    orbitPitch = Math.max(-0.5, Math.min(0.6, orbitPitch));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  const anyDown = (list) => list.some((code) => keys.has(code));
  const anyFresh = (list) => list.some((code) => fresh.has(code));

  return {
    /** Raw held-key set (for debugging or custom bindings). */
    keys,

    /** -1..1 strafe (A/D): positive is right. */
    get moveX() {
      return (anyDown(KEYS.right) ? 1 : 0) - (anyDown(KEYS.left) ? 1 : 0);
    },
    /** -1..1 throttle (W/S): positive is forward. */
    get moveY() {
      return (anyDown(KEYS.up) ? 1 : 0) - (anyDown(KEYS.down) ? 1 : 0);
    },
    get sprint() {
      return anyDown(KEYS.sprint);
    },
    get brake() {
      return anyDown(KEYS.brake);
    },
    /** Held shoot key (F). Mouse clicks are one-shot: use clickPressed. */
    get shootHeld() {
      return anyDown(KEYS.shoot);
    },
    get orbitYaw() {
      return orbitYaw;
    },
    get orbitPitch() {
      return orbitPitch;
    },
    /** True only on the frame the key went down. */
    pressed(code) {
      return fresh.has(code);
    },
    get interactPressed() {
      return anyFresh(KEYS.interact);
    },
    get savePressed() {
      return anyFresh(KEYS.save);
    },
    get mutePressed() {
      return anyFresh(KEYS.mute);
    },
    get pausePressed() {
      return anyFresh(KEYS.pause);
    },
    get confirmPressed() {
      return anyFresh(KEYS.confirm);
    },
    get clickPressed() {
      return fresh.has('MouseClick');
    },
    /** Clear the one-shot presses; call once per frame after the loop reads them. */
    endFrame() {
      fresh.clear();
    },
  };
}
