// Vice Shores missions: Rook Marlowe owes a debt to the fixer Mama Lou, and the
// Kings crew stole her shipment. Four jobs pay the debt off, one at a time, each
// with a minimap marker, a payout, and a line of story. Completing a job pays out,
// plays the jingle and autosaves.
import * as THREE from 'three';
import { saveGame } from './save.js';

// Mission markers sit ON road intersections (road lines -222, -148, -74, 0,
// 74, 148, 222), never inside a block: the Marina up by the northern beach,
// the Docks on the west road, the Kings' warehouse on the east road, and the
// hideout downtown.
const MARINA = { x: 148, z: -222 };
const DOCKS = { x: -222, z: 148 };
const WAREHOUSE = { x: 222, z: 148 };
const HIDEOUT = { x: -148, z: -148 };
const ARRIVE = 9;
// Seconds Rook must survive the warehouse shootout in mission 4.
const SHOOTOUT_SECONDS = 20;

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

function near(player, spot) {
  const at = readPos(player);
  return Math.hypot(at.x - spot.x, at.z - spot.z) < ARRIVE;
}

export function createMissions(game) {
  const { player, hud, audio, police } = game;

  const list = [
    {
      index: 0,
      name: 'First Fare',
      brief: 'Mama Lou needs a driver. Take Rook\u2019s car to the Marina and prove you can still drive.',
      objective: 'Drive to the Marina marker.',
      marker: MARINA,
      reward: 150,
    },
    {
      index: 1,
      name: 'The Pickup',
      brief: 'A package is waiting at the Docks. Grab it — and shake the heat before you bring it home.',
      objective: 'Collect the package at the Docks, then drop to 1 star.',
      marker: DOCKS,
      reward: 300,
    },
    {
      index: 2,
      name: 'Getaway',
      brief: 'The Kings tipped off the PD. Three stars and sirens everywhere. Lose them all.',
      objective: 'Lose the 3-star wanted level.',
      marker: null,
      reward: 500,
    },
    {
      index: 3,
      name: 'The Big Score',
      brief: 'The Kings are holding Mama Lou\u2019s shipment in their warehouse. Take it back, survive the shootout, and bring it to the hideout. The debt ends tonight.',
      objective: 'Reach the Kings\u2019 warehouse.',
      marker: WAREHOUSE,
      reward: 1200,
    },
  ];

  let activeIndex = -1;
  let stage = 0;
  let stageTimer = 0;
  let doneCount = 0;
  const done = [false, false, false, false];
  let target = null;
  let packageMesh = null;

  // A small glowing package at the Docks while mission 2 waits to be picked up.
  // The scene comes from the world when it carries one; without it the minimap
  // marker still shows where the package is.
  const scene = game.world?.scene ?? game.scene ?? null;
  function showPackage(spot) {
    if (!scene || packageMesh) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xe8c33a, emissive: 0x664400 }),
    );
    mesh.position.set(spot.x, 0.8, spot.z);
    scene.add(mesh);
    packageMesh = mesh;
  }
  function hidePackage() {
    if (scene && packageMesh) scene.remove(packageMesh);
    packageMesh = null;
  }

  function setObjectiveText(text) {
    if (hud?.setObjective) hud.setObjective(text);
  }
  function say(text) {
    if (hud?.showMessage) hud.showMessage(text);
  }

  function payOut(mission) {
    const reward = mission.reward;
    const money = (typeof player?.money === 'number' ? player.money : 0) + reward;
    if (player) player.money = money;
    if (typeof game.money === 'number') game.money = money;
    if (hud?.setMoney) hud.setMoney(money);
    if (audio?.jingle) audio.jingle();
    say(`Job done — $${reward} in the pocket.`);
  }

  function autosave() {
    const at = readPos(player);
    // The same nested shape the main loop saves (collectState), so a mission
    // autosave and a P-save restore identically through applySave.
    const state = {
      player: {
        x: at.x,
        z: at.z,
        heading: typeof player?.heading === 'number' ? player.heading : 0,
        health: typeof player?.health === 'number' ? player.health : 100,
        money: typeof player?.money === 'number' ? player.money : 0,
      },
      mission: Math.min(list.length - 1, doneCount),
      wanted: police ? police.wanted : 0,
    };
    if (typeof game.seed === 'number') state.seed = game.seed;
    if (typeof game.save === 'function') game.save(state);
    else if (game.save?.saveGame) game.save.saveGame(state);
    else saveGame(state);
  }

  function complete(mission) {
    done[mission.index] = true;
    doneCount += 1;
    // Mark the entry itself: the main loop ends the run on current.done.
    mission.done = true;
    mission.completed = true;
    payOut(mission);
    hidePackage();
    const finished = mission.index;
    autosave();
    if (finished === 3) {
      // Leave the completed mission current: the main loop reads
      // missions.current.done on its next frame and ends the run with the
      // 'mission-complete' screen. Do not show an end screen here.
      target = null;
      setObjectiveText('Debt paid. Vice Shores is yours, Rook.');
      return;
    }
    activeIndex = -1;
    stage = 0;
    target = null;
    const next = list[finished + 1];
    setObjectiveText(`Next job: ${next.name} — $${next.reward}.`);
  }

  /** Move the active mission one step forward (used by main.js objective triggers). */
  function advance() {
    if (activeIndex < 0) return;
    if (activeIndex === 1 && stage === 0) {
      stage = 1;
      hidePackage();
      if (police?.addHeat) police.addHeat(2);
      // The main loop re-reads the mission's objective every frame, so the
      // stage text has to live on the mission itself, not just in a HUD call.
      list[1].objective = 'Package grabbed — drop to 1 star to shake the heat.';
      setObjectiveText(list[1].objective);
      say('Package grabbed. Lose the heat!');
    } else if (activeIndex === 3 && stage === 0) {
      stage = 1;
      stageTimer = 0;
      if (police?.addHeat) police.addHeat(4);
      list[3].objective = 'Survive the shootout — hold on!';
      setObjectiveText(list[3].objective);
      say('The Kings are here. Survive!');
    }
  }

  function start(i) {
    const mission = list[i];
    if (!mission || done[i]) return false;
    // Never clobber a job already in progress; finish it or fail it first.
    if (activeIndex >= 0) return false;
    activeIndex = i;
    stage = 0;
    stageTimer = 0;
    target = mission.marker ? { ...mission.marker } : null;
    setObjectiveText(mission.objective);
    say(`${mission.name} — ${mission.brief}`);
    if (i === 1) showPackage(DOCKS);
    if (i === 2 && police?.addHeat) police.addHeat(3);
    return true;
  }

  // Stage text overwrites a mission's objective as it advances; a restart
  // restores the originals so the next run reads the first-stage text again.
  const ORIGINAL_OBJECTIVES = list.map((m) => m.objective);

  /** Full reset for Play again: clear every mission, including a completed one. */
  function reset() {
    activeIndex = -1;
    stage = 0;
    stageTimer = 0;
    doneCount = 0;
    done.fill(false);
    target = null;
    hidePackage();
    for (const mission of list) {
      mission.done = false;
      mission.completed = false;
      mission.objective = ORIGINAL_OBJECTIVES[mission.index];
    }
    setObjectiveText('Free roam — find work around Vice Shores.');
  }

  function update(dt) {
    if (activeIndex < 0) return;
    const mission = list[activeIndex];
    // A finished mission stays current until the main loop ends the run;
    // never pay it out twice.
    if (mission.done) return;

    if (packageMesh) {
      packageMesh.rotation.y += dt * 1.5;
      packageMesh.position.y = 0.8 + Math.sin(performance.now() / 300) * 0.15;
    }

    if (activeIndex === 0) {
      if (target && near(player, target)) complete(mission);
    } else if (activeIndex === 1) {
      if (stage === 0 && target && near(player, target)) {
        advance();
      } else if (stage === 1 && police && police.wanted <= 1) {
        complete(mission);
      }
    } else if (activeIndex === 2) {
      if (police && police.wanted === 0) complete(mission);
    } else if (activeIndex === 3) {
      if (stage === 0 && target && near(player, target)) {
        advance();
      } else if (stage === 1) {
        stageTimer += dt;
        if (stageTimer >= SHOOTOUT_SECONDS) {
          stage = 2;
          target = { ...HIDEOUT };
          list[3].objective = 'Shipment secured — get to the hideout.';
          setObjectiveText(list[3].objective);
          say('Shipment secured. Run for the hideout!');
        }
      } else if (stage === 2 && target && near(player, target)) {
        complete(mission);
      }
    }
  }

  const api = {
    list,
    get current() {
      return activeIndex >= 0 ? list[activeIndex] : null;
    },
    get marker() {
      return target ? { ...target } : null;
    },
    get packageVisible() {
      return packageMesh !== null;
    },
    start,
    update,
    reset,
    onObjective: advance,
  };
  return api;
}
