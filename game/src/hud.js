// Vice Shores HUD: health, money, wanted stars, objective, speed, a canvas
// minimap and the start / end screens. It wires the DOM ids from index.html
// and creates any missing piece itself, so the HUD works even if the page
// markup is still the starter's. Wanted stars are ★ characters; the minimap
// is a top-down 2D canvas with roads, the player arrow, police dots and the
// mission diamond.
//
// The page's own markup stays in charge: health / money / speed spans hold
// bare numbers (their labels sit beside them in the HTML), the start screen
// keeps its own Start button (the main loop wires it and continues a save
// through it), and the end screen keeps its own Play again button. The HUD
// only fills in text and shows or hides the screens — it never rebuilds them.
const DEFAULT_LINES = [-222, -148, -74, 0, 74, 148, 222];
const DEFAULT_HALF = 229;
const MAP_SIZE = 180;

function getOrCreate(id, tag, style) {
  const found = document.getElementById(id);
  if (found) return { el: found, created: false };
  const el = document.createElement(tag);
  el.id = id;
  if (style) Object.assign(el.style, style);
  document.body.appendChild(el);
  return { el, created: true };
}

function hudChip(top) {
  return {
    position: 'fixed',
    left: '12px',
    top,
    padding: '6px 10px',
    background: 'rgba(10,14,20,0.72)',
    color: '#eef1f5',
    font: '600 15px system-ui, sans-serif',
    borderRadius: '6px',
    zIndex: '10',
    pointerEvents: 'none',
  };
}

export function initHUD() {
  const health = getOrCreate('hud-health', 'div', hudChip('12px'));
  const money = getOrCreate('hud-money', 'div', hudChip('48px'));
  const wanted = getOrCreate('hud-wanted', 'div', hudChip('84px'));
  const objective = getOrCreate('hud-objective', 'div', {
    ...hudChip('120px'),
    maxWidth: '340px',
    pointerEvents: 'none',
  });
  const speed = getOrCreate('hud-speed', 'div', {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    padding: '6px 10px',
    background: 'rgba(10,14,20,0.72)',
    color: '#eef1f5',
    font: '600 15px system-ui, sans-serif',
    borderRadius: '6px',
    zIndex: '10',
    pointerEvents: 'none',
  });
  const message = getOrCreate('message', 'div', {
    position: 'fixed',
    left: '50%',
    top: '18%',
    transform: 'translateX(-50%)',
    padding: '10px 18px',
    background: 'rgba(10,14,20,0.82)',
    color: '#ffd94d',
    font: '600 18px system-ui, sans-serif',
    borderRadius: '8px',
    zIndex: '11',
    display: 'none',
    textAlign: 'center',
    maxWidth: '80vw',
  });
  const crosshair = getOrCreate('crosshair', 'div', {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    color: 'rgba(255,255,255,0.85)',
    font: '700 20px system-ui, sans-serif',
    zIndex: '9',
    pointerEvents: 'none',
    textShadow: '0 0 4px rgba(0,0,0,0.8)',
  });
  // Only a HUD-created crosshair needs a text mark; the page's own crosshair
  // is drawn with CSS and a '+' here would double it.
  if (crosshair.created) crosshair.el.textContent = '+';

  const minimap = getOrCreate('minimap', 'canvas', {
    position: 'fixed',
    right: '12px',
    top: '12px',
    width: `${MAP_SIZE}px`,
    height: `${MAP_SIZE}px`,
    background: 'rgba(10,14,20,0.82)',
    borderRadius: '8px',
    zIndex: '10',
    pointerEvents: 'none',
  });
  minimap.el.width = MAP_SIZE;
  minimap.el.height = MAP_SIZE;
  const mapCtx = minimap.el.getContext('2d');

  const startScreen = getOrCreate('start-screen', 'div', {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(8,10,16,0.88)',
    color: '#eef1f5',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '20',
  });
  const endScreen = getOrCreate('end-screen', 'div', {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(8,10,16,0.88)',
    color: '#eef1f5',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '20',
  });

  let messageTimer = 0;

  const api = {
    setHealth(v) {
      const n = Math.max(0, Math.round(v));
      health.el.textContent = health.created ? `Health ${n}` : `${n}`;
    },
    setMoney(v) {
      const n = Math.round(v);
      money.el.textContent = money.created ? `$${n}` : `${n}`;
    },
    setWanted(n) {
      const stars = Math.max(0, Math.min(5, Math.round(n)));
      wanted.el.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    },
    setObjective(t) {
      objective.el.textContent = t || '';
    },
    // The main loop already passes km/h, so the value is shown as-is.
    setSpeed(v) {
      const n = Math.max(0, Math.round(v));
      speed.el.textContent = speed.created ? `${n} km/h` : `${n}`;
    },
    showMessage(t, ms) {
      if (!t) {
        message.el.style.display = 'none';
        return;
      }
      message.el.textContent = t;
      message.el.style.display = 'block';
      window.clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => {
        message.el.style.display = 'none';
      }, ms ?? 3200);
    },
    drawMinimap(state) {
      if (!mapCtx || !state) return;
      const ctx = mapCtx;
      const size = MAP_SIZE;
      const half = state.bounds ?? state.world?.bounds ?? DEFAULT_HALF;
      const lines = state.world?.roadNetwork?.lines ?? DEFAULT_LINES;
      const scale = size / (half * 2);
      const toX = (x) => size / 2 + x * scale;
      const toY = (z) => size / 2 + z * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(16,22,32,0.9)';
      ctx.fillRect(0, 0, size, size);

      // Roads as a grid on the world's own road lines.
      ctx.strokeStyle = 'rgba(120,130,150,0.55)';
      ctx.lineWidth = 2;
      for (const at of lines) {
        ctx.beginPath();
        ctx.moveTo(toX(at), 0);
        ctx.lineTo(toX(at), size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, toY(at));
        ctx.lineTo(size, toY(at));
        ctx.stroke();
      }

      // Mission marker: a yellow diamond. The main loop passes the mission
      // itself as `objective`; its marker is what gets drawn.
      const marker = state.marker ?? state.missionMarker ?? state.objective?.marker ?? null;
      if (marker && typeof marker.x === 'number') {
        const mx = toX(marker.x);
        const my = toY(marker.z);
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.moveTo(mx, my - 7);
        ctx.lineTo(mx + 6, my);
        ctx.lineTo(mx, my + 7);
        ctx.lineTo(mx - 6, my);
        ctx.closePath();
        ctx.fill();
      }

      // Traffic: white dots.
      const traffic = state.traffic ?? state.cars ?? [];
      ctx.fillStyle = '#ffffff';
      for (const car of traffic) {
        const at = car.pos ?? car.mesh?.position ?? car;
        if (!at || typeof at.x !== 'number') continue;
        ctx.beginPath();
        ctx.arc(toX(at.x), toY(at.z), 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Police: red dots.
      const police = state.police ?? state.policeCars ?? [];
      ctx.fillStyle = '#ff4444';
      for (const car of police) {
        const at = car.pos ?? car.mesh?.position ?? car;
        if (!at || typeof at.x !== 'number') continue;
        ctx.beginPath();
        ctx.arc(toX(at.x), toY(at.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player: an arrow pointing along the heading. The player object keeps
      // its position in .pos (a Vector3) and its heading in .heading.
      const playerObj = state.playerPos ?? state.player ?? null;
      const at = playerObj?.pos ?? playerObj;
      if (at && typeof at.x === 'number') {
        const px = toX(at.x);
        const py = toY(at.z);
        const heading = playerObj?.heading ?? at.heading ?? 0;
        ctx.save();
        ctx.translate(px, py);
        // Canvas y grows downward while world z grows toward the viewer, so
        // the arrow turns the other way around the screen axis.
        ctx.rotate(Math.PI - heading);
        ctx.fillStyle = '#4fc3f7';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5.5, 6);
        ctx.lineTo(-5.5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
    showStart(saveExists) {
      endScreen.el.style.display = 'none';
      startScreen.el.style.display = 'flex';
      // The page's own start screen (title, story, Start button) stays
      // exactly as written: the main loop wires its Start button and
      // continues a save through it. Just note the save when there is one.
      const saveNote = document.getElementById('save-note');
      if (saveNote) {
        saveNote.textContent = saveExists ? 'Save found — Start continues your last run.' : '';
      }
      const startButton = document.getElementById('start-button');
      if (startButton) {
        // Keyboard-first: Enter on the focused button starts the game.
        startButton.focus();
        return;
      }
      // Fallback for a page without its own start screen: build one.
      startScreen.el.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.cssText = 'max-width: 560px; padding: 32px; text-align: center;';
      const title = document.createElement('h1');
      title.textContent = 'VICE SHORES';
      title.style.cssText = 'margin: 0 0 8px; font-size: 52px; letter-spacing: 6px; color: #ff5d8f;';
      const blurb = document.createElement('p');
      blurb.textContent = 'Rook Marlowe, getaway driver, owes a debt to the fixer Mama Lou — and the Kings crew stole her shipment. Four jobs stand between Rook and freedom. Drive the city, dodge the law, take back what is hers.';
      blurb.style.cssText = 'color: #c8cfdb; line-height: 1.5; margin: 0 0 16px;';
      const controls = document.createElement('p');
      controls.textContent = 'WASD drive / walk · E enter or steal a car · Mouse click or F shoot · P save · M mute';
      controls.style.cssText = 'color: #8b93a3; font-size: 14px; margin: 0 0 20px;';
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.textContent = 'Start';
      startBtn.style.cssText = 'padding: 12px 34px; font-size: 18px; font-weight: 700; background: #ff5d8f; color: #fff; border: 0; border-radius: 8px; cursor: pointer; margin: 4px;';
      startBtn.addEventListener('click', () => {
        startScreen.el.style.display = 'none';
        if (typeof api.onStart === 'function') api.onStart('new');
      });
      panel.append(title, blurb, controls, startBtn);
      if (saveExists) {
        const contBtn = document.createElement('button');
        contBtn.type = 'button';
        contBtn.textContent = 'Continue';
        contBtn.style.cssText = 'padding: 12px 34px; font-size: 18px; font-weight: 700; background: #2a3040; color: #eef1f5; border: 1px solid #4a5468; border-radius: 8px; cursor: pointer; margin: 4px;';
        contBtn.addEventListener('click', () => {
          startScreen.el.style.display = 'none';
          if (typeof api.onStart === 'function') api.onStart('continue');
        });
        panel.appendChild(contBtn);
      }
      startScreen.el.appendChild(panel);
    },
    showEnd(kind) {
      startScreen.el.style.display = 'none';
      const win = kind === 'win' || kind === 'mission-complete';
      const wrecked = kind === 'wrecked' || kind === 'wasted';
      const titleText = win ? 'THE BIG SCORE' : wrecked ? 'WRECKED' : 'BUSTED';
      const bodyText = win
        ? 'Shipment recovered, debt paid, Kings humbled. Mama Lou is square with Rook — and Vice Shores is his to drive.'
        : wrecked
          ? 'The getaway came apart with the law on Rook\u2019s tail. Mama Lou does not offer second chances — but the city does.'
          : 'The Vice Shores PD caught up with Rook on foot. The debt is still waiting — and so is the city.';
      // The page's own end screen keeps its Play again button (the main loop
      // wires it); only the words and the win styling change.
      const endTitle = document.getElementById('end-title');
      const endText = document.getElementById('end-text');
      if (endTitle && endText) {
        endTitle.textContent = titleText;
        endText.textContent = bodyText;
        endScreen.el.classList.toggle('complete', win);
        endScreen.el.style.display = 'flex';
        return;
      }
      // Fallback for a page without its own end screen: build one.
      endScreen.el.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.cssText = 'max-width: 560px; padding: 32px; text-align: center;';
      const title = document.createElement('h1');
      title.textContent = titleText;
      title.style.cssText = `margin: 0 0 8px; font-size: 44px; letter-spacing: 4px; color: ${win ? '#ffd94d' : '#e5534b'};`;
      const blurb = document.createElement('p');
      blurb.textContent = bodyText;
      blurb.style.cssText = 'color: #c8cfdb; line-height: 1.5; margin: 0 0 20px;';
      const againBtn = document.createElement('button');
      againBtn.type = 'button';
      againBtn.textContent = 'Play again';
      againBtn.style.cssText = 'padding: 12px 34px; font-size: 18px; font-weight: 700; background: #ff5d8f; color: #fff; border: 0; border-radius: 8px; cursor: pointer;';
      againBtn.addEventListener('click', () => {
        endScreen.el.style.display = 'none';
        if (typeof api.onStart === 'function') api.onStart('restart');
      });
      panel.append(title, blurb, againBtn);
      endScreen.el.appendChild(panel);
      endScreen.el.style.display = 'flex';
    },
    // Assigned by main.js: called with 'new', 'continue' or 'restart'.
    onStart: null,
  };

  api.setHealth(100);
  api.setMoney(0);
  api.setWanted(0);
  api.setObjective('');
  api.setSpeed(0);
  return api;
}
