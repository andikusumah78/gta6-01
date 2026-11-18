// Vice Shores save: one localStorage slot for Rook's progress. The state is
// stored exactly as the caller passes it — the main loop saves a nested shape
// { player: { x, z, heading, health, money }, mission, wanted, seed } and
// restores it through applySave, while missions autosave the same shape — so
// this module never reshapes or drops fields. P saves from the game; a mission
// completion autosaves. loadGame returns null when there is no save yet.
export const SAVE_KEY = 'vice-shores-save-v1';

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Remove the saved run, e.g. when the player starts over from scratch. */
export function clearSave() {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function saveGame(state) {
  const storage = safeStorage();
  if (!storage || !state || typeof state !== 'object') return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the saved state, or null when there is no save (or it is unreadable).
 * Accepts the nested shape the main loop writes (a `player` object) and the
 * flat shape { money, health, missionIndex, playerPos, wanted }.
 */
export function loadGame() {
  const storage = safeStorage();
  if (!storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const nested = data.player && typeof data.player === 'object'
      && typeof data.player.x === 'number' && typeof data.player.z === 'number';
    const flat = typeof data.money === 'number' && typeof data.missionIndex === 'number';
    if (!nested && !flat) return null;
    // Normalise a flat save's position so a half-written save cannot
    // teleport the player to NaN.
    if (flat && (!data.playerPos || typeof data.playerPos.x !== 'number' || typeof data.playerPos.z !== 'number')) {
      data.playerPos = { x: 0, z: 0 };
    }
    return data;
  } catch {
    return null;
  }
}
