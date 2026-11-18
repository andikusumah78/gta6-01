// Seeded randomness for Vice Shores: the same ?seed=N builds the same city, so
// screenshots and replays are repeatable. Built on mulberry32, a tiny 32-bit PRNG.

/** Raw mulberry32 step: returns a float in [0, 1) and advances the state object. */
export function mulberry32(state) {
  state.a = (state.a + 0x6d2b79f5) | 0;
  let t = Math.imul(state.a ^ (state.a >>> 15), 1 | state.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Create a seeded RNG with helpers. `seed` is any integer; the same seed always
 * yields the same sequence.
 */
export function createRandom(seed) {
  const state = { a: (seed | 0) || 1 };

  const rng = {
    /** Next float in [0, 1). */
    next() {
      return mulberry32(state);
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + (max - min) * mulberry32(state);
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(mulberry32(state) * (max - min + 1));
    },
    /** One element picked uniformly from a non-empty array. */
    pick(list) {
      return list[Math.floor(mulberry32(state) * list.length)];
    },
    /** True with probability p (0..1). */
    chance(p) {
      return mulberry32(state) < p;
    },
    /** A shuffled copy of the array (Fisher-Yates). */
    shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(mulberry32(state) * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    },
    /** A child RNG seeded from the next draw, so subsystems stay deterministic. */
    fork() {
      return createRandom(Math.floor(mulberry32(state) * 2147483647) + 1);
    },
  };
  return rng;
}

/** Read ?seed=N from the URL; falls back to `fallback` when absent or invalid. */
export function seedFromURL(fallback = 1) {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}
