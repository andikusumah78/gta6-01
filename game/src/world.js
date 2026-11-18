// Vice Shores city: a 6x6 block grid on the coast, built entirely from boxes,
// canvas textures and a few cylinders. No network, no external assets — every
// texture is painted on a <canvas> at boot and reused across the city.
import * as THREE from 'three';
import { CITY, COLORS } from './config.js';

/** A canvas texture of a building facade: warm plaster with a grid of windows. */
function makeFacadeTexture(rng, base) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  // Slight vertical shading so the facade reads as sunlit at the top.
  const shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, 256);
  // Window grid: 4 columns, rows every 32 px, some lit warm, most dark glass.
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = rng.chance(0.28);
      ctx.fillStyle = lit ? '#ffd98a' : '#2e3a4f';
      ctx.fillRect(14 + col * 28, 16 + row * 32, 18, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(14 + col * 28, 16 + row * 32, 18, 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Asphalt with a dashed centre line, tiled along the road's length. The road
 * boxes map U along their 472 m length and V across their 14 m width, so the
 * dash runs along U (horizontal in the canvas) and the texture repeats 33x
 * in U (one ~14 m tile per repeat) and once in V. */
function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(0, 0, 64, 128);
  // Speckle for asphalt grain.
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * 64, Math.random() * 128, 2, 2);
  }
  // Dashed centre line (runs along U, the road's length): centred in V.
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(8, 62, 48, 4);
  // Solid edge lines, also along U.
  ctx.fillRect(0, 2, 64, 2);
  ctx.fillRect(0, 124, 64, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** True when the circle at (x, z) with radius r overlaps any collider AABB. */
export function circleHits(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** Push a circle out of every overlapping collider (smallest push first). */
export function resolveCircle(x, z, r, colliders) {
  let px = x;
  let pz = z;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(px, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pz, c.maxZ));
    let dx = px - cx;
    let dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 < 1e-8) {
      // Centre inside the box: shove out along the smallest penetration axis.
      const pushLeft = px - c.minX;
      const pushRight = c.maxX - px;
      const pushBack = pz - c.minZ;
      const pushFront = c.maxZ - pz;
      const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (min === pushLeft) px = c.minX - r;
      else if (min === pushRight) px = c.maxX + r;
      else if (min === pushBack) pz = c.minZ - r;
      else pz = c.maxZ + r;
      continue;
    }
    const d = Math.sqrt(d2);
    dx /= d;
    dz /= d;
    px = cx + dx * r;
    pz = cz + dz * r;
  }
  return { x: px, z: pz };
}

function addPalm(scene, rng, x, z, trunkMat, leafMat) {
  const palm = new THREE.Group();
  const lean = rng.range(-0.08, 0.08);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 4.6, 6), trunkMat);
  trunk.position.y = 2.3;
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(angle) * 0.9, 4.7, Math.sin(angle) * 0.9);
    frond.rotation.z = Math.cos(angle) * 1.15;
    frond.rotation.x = -Math.sin(angle) * 1.15;
    frond.scale.set(1, 1, 0.25);
    frond.castShadow = true;
    palm.add(frond);
  }
  palm.position.set(x, 0, z);
  scene.add(palm);
}

function addLamp(scene, x, z, poleMat, headMat) {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6), poleMat);
  pole.position.y = 2.6;
  pole.castShadow = true;
  lamp.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), poleMat);
  arm.position.set(0.5, 5.1, 0);
  lamp.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24), headMat);
  head.position.set(1.0, 5.05, 0);
  lamp.add(head);
  lamp.position.set(x, 0, z);
  scene.add(lamp);
}

function addBench(scene, x, z, heading, woodMat, ironMat) {
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), woodMat);
  seat.position.y = 0.45;
  seat.castShadow = true;
  bench.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), woodMat);
  back.position.set(0, 0.75, -0.24);
  back.rotation.x = -0.15;
  bench.add(back);
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), ironMat);
    leg.position.set(sx, 0.22, 0);
    bench.add(leg);
  }
  bench.position.set(x, 0, z);
  bench.rotation.y = heading;
  scene.add(bench);
}

/**
 * Build the whole city into `scene`. Returns colliders (building AABBs),
 * the road network, spawn points and the world bounds.
 */
export function buildWorld(scene, rng) {
  const colliders = [];

  // --- Lights & atmosphere -------------------------------------------------
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
  sun.position.set(140, 190, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5f, 0.9));

  // --- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -20);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Roads ------------------------------------------------------------------
  const roadTexture = makeRoadTexture();
  // One shared material/texture for every road: tile the dashes along the length.
  roadTexture.repeat.set(Math.round((CITY.halfExtent * 2 + CITY.streetWidth) / 14), 1);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.95 });
  const roadLen = CITY.halfExtent * 2 + CITY.streetWidth;
  for (const line of CITY.roadLines) {
    for (const along of ['x', 'z']) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.1, CITY.streetWidth), roadMat);
      if (along === 'x') road.position.set(0, 0.02, line);
      else {
        // Turn the box so its local length (U) runs along world z, matching
        // the x-roads' mapping; otherwise this road's dashes run across it.
        road.rotation.y = Math.PI / 2;
        road.position.set(line, 0.02, 0);
      }
      road.receiveShadow = true;
      scene.add(road);
    }
  }

  // --- Sidewalks & buildings --------------------------------------------------
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.9 });
  const facadeMats = COLORS.facades.slice(0, 4).map(
    (hex) => new THREE.MeshStandardMaterial({ map: makeFacadeTexture(rng, `#${hex.toString(16).padStart(6, '0')}`), roughness: 0.85 }),
  );
  const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ab, roughness: 0.8 });

  for (const bx of CITY.blockCenters) {
    for (const bz of CITY.blockCenters) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(CITY.blockSize + 2, 0.18, CITY.blockSize + 2), sidewalkMat);
      slab.position.set(bx, 0.09, bz);
      slab.receiveShadow = true;
      scene.add(slab);

      const twin = rng.chance(0.42);
      const spots = twin
        ? [
            { x: bx - 15, z: bz, w: rng.range(18, 26), d: rng.range(26, 44) },
            { x: bx + 15, z: bz, w: rng.range(18, 26), d: rng.range(26, 44) },
          ]
        : [{ x: bx + rng.range(-6, 6), z: bz + rng.range(-6, 6), w: rng.range(26, 44), d: rng.range(26, 44) }];
      for (const spot of spots) {
        const h = rng.chance(0.16) ? rng.range(28, 45) : rng.range(8, 26);
        const facade = rng.pick(facadeMats);
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(spot.w, h, spot.d),
          [facade, facade, roofMat, roofMat, facade, facade],
        );
        building.position.set(spot.x, 0.18 + h / 2, spot.z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        colliders.push({
          minX: spot.x - spot.w / 2,
          maxX: spot.x + spot.w / 2,
          minZ: spot.z - spot.d / 2,
          maxZ: spot.z + spot.d / 2,
        });
        if (h < 22 && rng.chance(0.5)) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.6), acMat);
          ac.position.set(spot.x + rng.range(-spot.w / 4, spot.w / 4), 0.18 + h + 0.5, spot.z);
          ac.castShadow = true;
          scene.add(ac);
        }
      }
    }
  }

  // --- Beach & water (north edge, -z): sand, palms, benches, sea --------------
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(520, 0.1, 20),
    new THREE.MeshStandardMaterial({ color: COLORS.sand, roughness: 1 }),
  );
  sand.position.set(0, 0.03, -239);
  sand.receiveShadow = true;
  scene.add(sand);
  const waterMat = new THREE.MeshStandardMaterial({
    color: COLORS.water,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(560, 80), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.06, -289);
  scene.add(water);

  const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.trunk, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: COLORS.palmLeaf, roughness: 0.9 });
  for (let i = 0; i < 12; i += 1) {
    addPalm(scene, rng, -210 + i * 38 + rng.range(-6, 6), -234 + rng.range(-2, 2), trunkMat, leafMat);
  }
  for (let i = 0; i < 8; i += 1) {
    const line = rng.pick(CITY.roadLines);
    const other = rng.pick(CITY.blockCenters);
    addPalm(scene, rng, line + 8.5, other + rng.range(-20, 20), trunkMat, leafMat);
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.6, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({
    color: COLORS.lampHead,
    emissive: 0xffdf8a,
    emissiveIntensity: 0.9,
  });
  CITY.roadLines.forEach((lx, ix) => {
    CITY.roadLines.forEach((lz, iz) => {
      if ((ix + iz) % 2 === 0) addLamp(scene, lx + 8.5, lz + 8.5, poleMat, headMat);
    });
  });

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xa9743f, roughness: 0.9 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.5 });
  for (let i = 0; i < 6; i += 1) {
    addBench(scene, -180 + i * 72, -232, 0, woodMat, ironMat);
  }

  // --- Spawn points ------------------------------------------------------------
  const spawnPoints = {
    player: { x: 0, y: 0, z: 20, heading: Math.PI },
    cars: [
      { x: 6.5, z: -160, heading: Math.PI },
      { x: -6.5, z: -100, heading: 0 },
      { x: 6.5, z: -40, heading: Math.PI },
      { x: -6.5, z: 60, heading: 0 },
      { x: 6.5, z: 120, heading: Math.PI },
      { x: -180, z: 80.5, heading: Math.PI / 2 },
      { x: -60, z: 67.5, heading: -Math.PI / 2 },
      { x: 80, z: 80.5, heading: Math.PI / 2 },
      { x: 180, z: 67.5, heading: -Math.PI / 2 },
      { x: -80.5, z: -180, heading: 0 },
    ],
    peds: [],
  };
  for (let i = 0; i < 14; i += 1) {
    const line = rng.pick(CITY.roadLines);
    const along = rng.pick(CITY.blockCenters) + rng.range(-24, 24);
    spawnPoints.peds.push(rng.chance(0.5) ? { x: line + 8.5, z: along } : { x: along, z: line + 8.5 });
  }

  return {
    scene,
    colliders,
    roadNetwork: { lines: CITY.roadLines.slice(), width: CITY.streetWidth, pitch: CITY.pitch, blockSize: CITY.blockSize },
    spawnPoints,
    bounds: CITY.bound,
    sun,
    water,
  };
}
