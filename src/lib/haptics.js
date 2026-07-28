import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Haptic feedback, used sparingly and only on the safety-critical path.
 *
 * Why so few: a teacher marks 40 students in under two minutes while looking
 * at faces rather than the screen, so a pulse confirming the tap landed is
 * genuinely useful. Buzzing on every navigation would make the app feel busy
 * and would drain the meaning from the taps that matter.
 *
 * Why it must be switchable: Mangalarati is at 4:30 AM and night attendance
 * at 9:15 PM, both in dormitories. A vibrating phone is audible in a quiet
 * room, and 40 marks means 40 buzzes near sleeping children.
 */

const STORAGE_KEY = "gurukula.haptics.enabled";

// Cached in memory so the marking screen never awaits storage mid-tap.
let enabled = true;

export async function loadHapticsPreference() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === "true";
  } catch {
    // Storage unavailable — fall back to the default rather than blocking startup.
  }
  return enabled;
}

export async function setHapticsEnabled(value) {
  enabled = !!value;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The in-memory value still applies for this session.
  }
}

export const isHapticsEnabled = () => enabled;

// Haptics are unsupported or disabled on some devices; a failure here must
// never surface to the user or interrupt what they were doing.
const fire = (fn) => {
  if (!enabled) return;
  try {
    fn()?.catch?.(() => {});
  } catch {
    /* no motor, or the OS declined */
  }
};

export const haptics = {
  /** Student marked Absent — the one status meaning "unaccounted for". */
  markAbsent: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Undoing an Absent mark. Lighter, so the two are distinguishable by feel. */
  undoAbsent: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** A different status chosen from the sheet. */
  select: () => fire(() => Haptics.selectionAsync()),

  /** Attendance submitted — record locked, summary sent. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** The "N students marked absent" confirmation appearing. */
  warn: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
