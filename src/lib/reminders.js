import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchPendingDutiesForStaff } from "./duties";
import { colors } from "../theme/theme";
import { fmtTime } from "../utils/format";

/**
 * Reminders on the phone, before a checkpoint the signed-in person has to mark.
 *
 * WHY LOCAL AND NOT PUSH
 *
 * Every checkpoint's time is known the night before — `generate_duties_ahead()`
 * (migration 028) writes today's and tomorrow's rows at 00:30. Nothing has to
 * travel from a server at 4:20 AM to tell a phone that Mangalarati is at 4:30.
 * So these are scheduled ON the device: no Firebase project, no Apple Developer
 * account, no push tokens to store and expire, and nothing for the free-tier
 * database to do at 4:20 in the morning. The alarm fires with the app closed
 * and with no network, which in a dormitory at 4:30 AM is worth more than
 * anything push could add.
 *
 * The cost is that the device only knows what it was last told. Everything
 * below follows from that: the schedule is rebuilt from scratch every time the
 * app has a chance to look, and the horizon is deliberately short — two days,
 * never more — so a reminder made wrong by a reassignment has a day to be
 * corrected rather than a week.
 *
 * WHO GETS THEM
 *
 * Only the person the duty is assigned to. This is not the escalation chain in
 * SRS N1–N2: no coordinator, no MOD, no Principal, and no reminders about
 * someone else's checkpoint even though cover marking (migration 005) would let
 * them mark it. One phone buzzes, and it belongs to whoever is expected to be
 * standing there.
 */

const STORAGE_KEY = "bgis.reminders.enabled";
// Whether the system permission dialog has ever been shown. Android 13+ makes a
// second decline permanent, so the app gets exactly one unprompted attempt and
// must never spend it on a cold start.
const ASKED_KEY = "bgis.reminders.asked";
const CHANNEL_ID = "duty-reminders";

/**
 * How many minutes ahead each reminder lands.
 *
 * `opening` is the one that gets somebody to the hall on time. `closing` is the
 * safety net from SRS N1 — the last moment at which marking the register still
 * avoids an escalation. Both, because they do different jobs: a teacher already
 * standing at breakfast does not need the first, and a teacher who forgot
 * entirely is not helped by the first alone.
 */
const LEAD = [
  { kind: "opening", minutes: 10 },
  { kind: "closing", minutes: 10 },
];

/**
 * Today and tomorrow. Both days exist in `duties` by 00:30 (migration 028), and
 * stopping there is on purpose: a duty can be reassigned, and a reminder left
 * sitting on a phone for five days would outlive the fact it was scheduled from.
 */
const HORIZON_DAYS = 2;

/**
 * Anything closer than this is already too late to be worth an alarm — and
 * scheduling into the past is how a notification arrives instantly, at the
 * moment of the sync, for a checkpoint that finished hours ago.
 */
const MIN_NOTICE_SEC = 60;

/**
 * Where reminders cannot work at all: "web", "expo-go", or null for a real
 * phone build.
 *
 * EXPO GO IS NOT A SOFT LIMITATION, AND NOT ONLY ABOUT PUSH.
 * `expo-notifications` calls `addPushTokenListener` at module scope, inside
 * `DevicePushTokenAutoRegistration.fx.js`, and on Android inside Expo Go that
 * call THROWS rather than warning. So the crash happens on `import`, before any
 * of this file's own code runs, and it takes the whole app down at startup —
 * not the reminders, the app. The documented "local notifications still work in
 * Expo Go" does not survive that on Android.
 *
 * Hence the lazy `require` below. Reminders are simply absent in Expo Go, the
 * rest of the app keeps working there, and the Account screen says which build
 * is needed instead of failing silently.
 */
export function remindersUnavailableReason() {
  if (Platform.OS === "web") return "web";
  if (Platform.OS === "android" && isRunningInExpoGo()) return "expo-go";
  return null;
}

export const remindersSupported = () => remindersUnavailableReason() === null;

// Loaded on first use, never at import. Metro still bundles the module; it just
// never evaluates it on a platform where evaluating it is fatal.
let mod = null;

function notifications() {
  if (!remindersSupported()) return null;
  if (!mod) {
    // eslint-disable-next-line global-require
    mod = require("expo-notifications");
    // Shown as a banner even while the app is open: a teacher with one register
    // on screen still needs to know the next checkpoint is minutes away. Set
    // here so it happens exactly once, when the module first loads.
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return mod;
}

// Cached in memory so the Account screen can render the toggle without
// awaiting storage, exactly as the haptics preference does.
let enabled = true;

export async function loadReminderPreference() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === "true";
  } catch {
    // Storage unavailable — fall back to the default rather than blocking startup.
  }
  return enabled;
}

export async function setRemindersEnabled(value) {
  enabled = !!value;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The in-memory value still applies for this session.
  }
}

export const areRemindersEnabled = () => enabled;

/**
 * The Android channel. Required from Android 8, and it is what gives the user a
 * per-category switch in system settings — so someone who wants the app but not
 * the 4:20 AM buzz has somewhere to go that is not "uninstall".
 */
async function ensureChannel() {
  const N = notifications();
  if (!N || Platform.OS !== "android") return;
  try {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Duty reminders",
      description: "Before a checkpoint you are due to mark.",
      importance: N.AndroidImportance.HIGH,
      // Omitting sound uses Android's default. A string names a custom asset.
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.primary,
    });
  } catch (e) {
    console.warn("Could not create the notification channel:", e?.message);
  }
}

/**
 * Ask outright — the path behind the Account screen's toggle, where the user
 * has just said what they want and a dialog is expected.
 *
 * @returns "granted" | "blocked" | "denied" | "unsupported"
 *
 * "blocked" is the one worth distinguishing: the operating system will not show
 * a dialog at all, so the only way back is system settings, and a toggle that
 * silently springs back off is indistinguishable from a broken app.
 */
export async function ensureReminderPermission({ ask = false } = {}) {
  const N = notifications();
  if (!N) return "unsupported";
  await ensureChannel();
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return "granted";
    if (current.canAskAgain === false) return "blocked";
    if (!ask) return "denied";

    // Spend the one unprompted attempt here too, so the automatic path does
    // not show a second dialog later.
    await AsyncStorage.setItem(ASKED_KEY, "true").catch(() => {});
    const asked = await N.requestPermissionsAsync();
    if (asked.granted) return "granted";
    return asked.canAskAgain === false ? "blocked" : "denied";
  } catch (e) {
    console.warn("Could not read notification permission:", e?.message);
    return "denied";
  }
}

/**
 * Ask for permission once in the life of the install, and only when there is
 * something to be reminded about — called from the reminder sync after somebody
 * signs in and their duties have loaded.
 *
 * Without this, reminders default to on and never work: the preference says
 * yes, the operating system was never asked, and nothing buzzes. With it, the
 * one dialog the app is allowed to show arrives attached to a reason.
 *
 * @returns "granted" | "denied" | "unsupported"
 */
async function primeReminderPermission() {
  const N = notifications();
  if (!N) return "unsupported";
  if (!enabled) return "denied";
  await ensureChannel();

  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return "granted";
    // Declined for good, in the app or in system settings. Asking again does
    // nothing but return the same answer.
    if (current.canAskAgain === false) return "denied";

    if ((await AsyncStorage.getItem(ASKED_KEY)) === "true") return "denied";
    // Written BEFORE the prompt: if the app is killed while the dialog is up,
    // the attempt is still spent, and re-prompting on the next launch is how a
    // permission gets permanently declined.
    await AsyncStorage.setItem(ASKED_KEY, "true");

    const asked = await N.requestPermissionsAsync();
    return asked.granted ? "granted" : "denied";
  } catch (e) {
    console.warn("Could not request notification permission:", e?.message);
    return "denied";
  }
}

/** "YYYY-MM-DD" plus minutes-from-midnight, as a local Date. */
function dutyMoment(day, minutes) {
  const [y, m, d] = (day || "").split("-").map(Number);
  if (!y) return null;
  // Minutes overflow into hours on their own, so 260 is 4:20 AM. Local time,
  // never UTC — the phone's clock is the one the teacher works to.
  return new Date(y, m - 1, d, 0, minutes, 0, 0);
}

/** The days to look at: today and tomorrow, spelled as `duties.day` stores them. */
function horizon() {
  const pad = (n) => String(n).padStart(2, "0");
  const base = new Date();
  const out = [];
  for (let i = 0; i < HORIZON_DAYS; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

function contentFor(duty, kind, minutes) {
  if (kind === "opening") {
    return {
      title: `${duty.checkpoint} in ${minutes} min`,
      body: `${duty.group} · starts ${fmtTime(duty.start)}`,
    };
  }
  return {
    title: `${duty.checkpoint} closes in ${minutes} min`,
    body: `${duty.group} · not submitted yet`,
  };
}

export async function cancelAllReminders() {
  const N = notifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn("Could not clear reminders:", e?.message);
  }
}

/**
 * Rebuild the whole schedule for one person.
 *
 * Cancel-everything-then-reschedule rather than diffing. The app schedules
 * nothing else, the list is a handful of items, and the alternative — tracking
 * notification ids against duty ids across reassignments, submissions and
 * midnight — is a great deal of state to get subtly wrong for an alarm that has
 * to be right at 4:20 AM.
 *
 * Safe to call often. It runs on sign-in, on every return to the app, and after
 * every submission.
 *
 * @returns { scheduled, checkpoints, reason } — `scheduled` counts
 *          notifications, `checkpoints` counts the duties they belong to. They
 *          differ because each duty gets two, and it is the second number a
 *          teacher recognises: "two checkpoints left today" is a fact about
 *          their day, "four reminders" is a fact about the software.
 *          `reason` is why nothing was scheduled, which the Account screen
 *          reports rather than leaving the toggle to speak for itself.
 */
export async function syncDutyReminders(user) {
  const N = notifications();
  if (!N) return { scheduled: 0, checkpoints: 0, reason: remindersUnavailableReason() };

  // Signed out, or reminders switched off: the phone must be left holding
  // nothing. Someone who signs out of a shared handset should not keep getting
  // alarms for a register they can no longer open.
  if (!user?.id || !enabled) {
    await cancelAllReminders();
    return { scheduled: 0, checkpoints: 0, reason: user?.id ? "disabled" : "signed-out" };
  }

  // Asks at most once per install, and only here — by this point somebody has
  // signed in as staff, so the dialog arrives with a reason behind it.
  const permission = await primeReminderPermission();
  if (permission !== "granted") {
    await cancelAllReminders();
    return { scheduled: 0, checkpoints: 0, reason: "denied" };
  }

  let duties;
  try {
    duties = await fetchPendingDutiesForStaff(user.id, horizon());
  } catch (e) {
    // Offline. Leave what is already scheduled alone — the last known list is
    // very nearly right, and an empty one is certainly wrong.
    console.warn("Could not read duties for reminders:", e?.message);
    return { scheduled: 0, checkpoints: 0, reason: "offline" };
  }

  await cancelAllReminders();

  const cutoff = Date.now() + MIN_NOTICE_SEC * 1000;
  let scheduled = 0;
  let checkpoints = 0;

  for (const duty of duties) {
    const before = scheduled;
    for (const { kind, minutes } of LEAD) {
      const anchor = kind === "opening" ? duty.start : duty.end;
      const at = dutyMoment(duty.day, anchor - minutes);
      if (!at || at.getTime() < cutoff) continue;

      try {
        await N.scheduleNotificationAsync({
          content: {
            ...contentFor(duty, kind, minutes),
            data: { dutyId: duty.id, day: duty.day, kind },
            ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
          },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at },
        });
        scheduled += 1;
      } catch (e) {
        // One bad item must not cost the rest of the day's reminders.
        console.warn(`Could not schedule ${kind} reminder for ${duty.id}:`, e?.message);
      }
    }
    // A checkpoint whose opening ping is already past but whose closing one is
    // still ahead counts once, not twice and not zero.
    if (scheduled > before) checkpoints += 1;
  }

  return { scheduled, checkpoints, reason: scheduled ? null : "nothing-due" };
}
