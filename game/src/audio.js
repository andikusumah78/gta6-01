// Vice Shores audio: everything synthesized with WebAudio — oscillators and
// noise buffers, no audio files and no network. The AudioContext is created
// lazily on the first user gesture (the Start button), so the page never
// autoplay-blocks. M toggles mute.
let ctx = null;
let master = null;
// Mute survives a reload: the player's M-key choice is kept in localStorage.
let muted = false;
try {
  muted = window.localStorage.getItem('vice-shores-muted') === '1';
} catch {
  muted = false;
}
let engineNodes = null;
let sirenNodes = null;

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, startAt, dur, type, vol, slideTo) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), startAt + dur);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(vol, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
}

function noiseBurst(dur, filterFreq, vol) {
  if (!ctx || !master) return;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start();
}

export function createAudio() {
  return {
    /** Create / resume the context from a user gesture (Start button click). */
    unlock() {
      ensureCtx();
    },
    /** Engine hum: pitch and loudness follow speed01 (0 = idle, 1 = flat out). */
    engine(speed01) {
      const c = ensureCtx();
      if (!c || !master) return;
      const speed = Math.max(0, Math.min(1, speed01 || 0));
      if (!engineNodes) {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        const sub = c.createOscillator();
        sub.type = 'square';
        sub.frequency.value = 28;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const gain = c.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        sub.start();
        engineNodes = { osc, sub, gain };
      }
      const t = c.currentTime;
      engineNodes.osc.frequency.setTargetAtTime(55 + speed * 165, t, 0.08);
      engineNodes.sub.frequency.setTargetAtTime(28 + speed * 80, t, 0.08);
      engineNodes.gain.gain.setTargetAtTime(0.018 + speed * 0.05, t, 0.1);
    },
    /** Two-tone police siren loop while wanted > 0. */
    siren(on) {
      const c = ensureCtx();
      if (!c || !master) return;
      if (on && !sirenNodes) {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 780;
        const lfo = c.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.8;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 170;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const gain = c.createGain();
        gain.gain.value = 0.045;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        lfo.start();
        sirenNodes = { osc, lfo, gain };
      } else if (!on && sirenNodes) {
        try {
          sirenNodes.osc.stop();
          sirenNodes.lfo.stop();
        } catch {
          // Already stopped.
        }
        sirenNodes = null;
      }
    },
    /** Gunshot: a filtered noise crack plus a low thump. */
    shot() {
      if (!ensureCtx()) return;
      noiseBurst(0.14, 900, 0.5);
      tone(130, ctx.currentTime, 0.12, 'sine', 0.4, 42);
    },
    /** Soft two-note pickup chime. */
    chime() {
      if (!ensureCtx()) return;
      const t = ctx.currentTime;
      tone(659.25, t, 0.14, 'sine', 0.25);
      tone(880, t + 0.1, 0.2, 'sine', 0.25);
    },
    /** Mission-complete jingle: a rising four-note arpeggio. */
    jingle() {
      if (!ensureCtx()) return;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => tone(freq, t + i * 0.11, 0.22, 'triangle', 0.28));
    },
    setMuted(b) {
      muted = Boolean(b);
      try {
        window.localStorage.setItem('vice-shores-muted', muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    },
  };
}
