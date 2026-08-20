import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

/**
 * The wall clock, as the rest of the app measures time.
 *
 * This replaced `NOW` in mockData — a frozen 7:42 AM that every screen
 * imported. It was fine while the data was fake, but it did not only make the
 * header say the wrong time: `dutyStatus`, `escalationStage` and
 * `deriveAlerts` all take "now" as an argument, so with it pinned to 7:42 a
 * checkpoint closing at 7:30 stayed permanently overdue and one closing at
 * 1:10 PM stayed permanently pending, whatever the actual hour.
 *
 * One timer serves every subscriber, via useSyncExternalStore. Each screen
 * calling its own `setInterval` would mean four timers waking the device on
 * four unaligned schedules, for a value that is identical in all of them.
 */

/** Minutes from midnight, local time — the unit `checkpoints.start_min` and
 *  `end_min` are stored in, so comparisons need no conversion. */
export const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

let current = minutesNow();
const listeners = new Set();
let timeout = null;
let appSub = null;

const emit = () => {
  const next = minutesNow();
  // Only wake React when the MINUTE changes. getSnapshot must also return a
  // stable value between real changes, or useSyncExternalStore re-renders
  // forever.
  if (next !== current) {
    current = next;
    listeners.forEach((l) => l());
  }
};

const schedule = () => {
  // Aligned to the wall-clock minute, not 60s from whenever the first screen
  // mounted: a duty that closes at 7:30 has to flip to overdue as 7:30
  // passes, not up to 59 seconds afterwards. The small offset keeps the tick
  // just past the boundary rather than racing it.
  timeout = setTimeout(() => {
    emit();
    schedule();
  }, 60000 - (Date.now() % 60000) + 50);
};

const subscribe = (onChange) => {
  listeners.add(onChange);
  if (listeners.size === 1) {
    current = minutesNow();
    schedule();
    // Timers are throttled or suspended while the app is backgrounded, so the
    // clock can be an hour stale by the time someone looks at it again. The
    // school day is exactly the situation where that happens — the phone goes
    // in a pocket between checkpoints.
    appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") emit();
    });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearTimeout(timeout);
      timeout = null;
      appSub?.remove();
      appSub = null;
    }
  };
};

/** Current time as minutes from midnight, re-rendering once a minute. */
export const useNow = () => useSyncExternalStore(subscribe, () => current);
