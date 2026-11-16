import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The last data this phone loaded, kept on the device so the app opens
 * straight onto it instead of a spinner. The network still refreshes it a
 * moment later; this only decides what is on screen while that happens.
 *
 * Keyed by the signed-in staff id, because what a person may read is decided
 * by row-level security: a teacher's cache must never be shown to the
 * coordinator who signs in on the same phone. Everything is wiped on sign-out
 * — these are children's names and whereabouts on a shared device.
 *
 * Every call swallows its own errors. A cache that cannot be read is an empty
 * cache, never a broken screen.
 */

const PREFIX = "cache:v1:";
const key = (staffId, name) => `${PREFIX}${staffId}:${name}`;

export async function readCache(staffId, name) {
  if (!staffId) return null;
  try {
    const raw = await AsyncStorage.getItem(key(staffId, name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeCache(staffId, name, value) {
  if (!staffId) return;
  try {
    await AsyncStorage.setItem(key(staffId, name), JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Full or unavailable storage: the app simply loads from the network.
  }
}

/**
 * Keep only `keepDay`'s register for this person; older days are dropped so
 * the cache does not grow a day at a time for the life of the install.
 */
export async function pruneDays(staffId, keepDay) {
  if (!staffId) return;
  try {
    const mine = `${PREFIX}${staffId}:day:`;
    const stale = (await AsyncStorage.getAllKeys()).filter(
      (k) => k.startsWith(mine) && k !== `${mine}${keepDay}`
    );
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    // nothing to prune
  }
}

/** Remove every cached entry, for everyone. Called on sign-out. */
export async function clearCache() {
  try {
    const all = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (all.length) await AsyncStorage.multiRemove(all);
  } catch {
    // nothing to clear
  }
}
