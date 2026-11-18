// Vice Shores — every tuning number and colour in one place.
// The city is a 6x6 grid of blocks. Roads run on seven lines per axis, 74 m apart
// (60 m block + 14 m street), so block centres sit at -185, -111, -37, 37, 111, 185
// and the outer road edges land near +/-229 m: the "about -220..+220" span.

export const CITY = {
  blocks: 6,
  blockSize: 60,
  streetWidth: 14,
  pitch: 74,
  roadLines: [-222, -148, -74, 0, 74, 148, 222],
  blockCenters: [-185, -111, -37, 37, 111, 185],
  halfExtent: 229,
  // Hard clamp for anything that moves: a little past the outer road edge.
  bound: 245,
};

export const SPAWN = { x: 0, y: 0, z: 20, heading: Math.PI };

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 10,
  accel: 42,
  radius: 0.5,
  maxHealth: 100,
};

export const CAR = {
  maxSpeed: 38,
  maxReverse: 12,
  accel: 16,
  brake: 30,
  handbrake: 55,
  steerMax: 0.62,
  wheelBase: 2.9,
  radius: 1.7,
  drag: 0.35,
};

export const CAMERA = {
  footDistance: 7.5,
  footHeight: 3.4,
  carDistance: 11.5,
  carHeight: 4.8,
  lookHeight: 1.7,
  lookAhead: 4,
  lerp: 5.5,
  menuRadius: 150,
  menuHeight: 52,
};

// Warm pastel sun-soaked palette: peach, sand, coral, mint, cream.
export const COLORS = {
  sky: 0x8ecfea,
  fog: 0xa8d4e6,
  sun: 0xffe8c0,
  ground: 0xd9c9a3,
  asphalt: 0x3a3f4a,
  sidewalk: 0xd9cfc0,
  sand: 0xf2d8a7,
  water: 0x2e9bc6,
  facades: [0xf6c6a8, 0xf9d976, 0xf7a8b8, 0xa8d8c8, 0xf2b880, 0xc8b8e8, 0xfff1d6],
  roof: 0x5a5f6b,
  trunk: 0x8a6b4f,
  palmLeaf: 0x3fae6a,
  lampHead: 0xffe9a8,
  playerShirt: 0x2fa8a0,
  playerPants: 0x2e3a4f,
  playerSkin: 0xe8b98a,
  playerCap: 0xd94f3d,
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
  interact: ['KeyE'],
  shoot: ['KeyF'],
  save: ['KeyP'],
  mute: ['KeyM'],
  pause: ['Escape'],
  confirm: ['Enter', 'Space'],
};

export const WANTED = {
  max: 5,
  heatPerCrime: 1,
  decayPerSecond: 0.04,
};

export const SAVE_KEY = 'vice-shores-save-v1';

export const SHOT_SETTLE_MS = 1500;
