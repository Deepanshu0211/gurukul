import { supabase } from "./supabase";
import { isNotDeployed } from "./errors";

/**
 * Declared holidays — days the school does not take a register.
 *
 * A holiday is a row per day, keyed by the day itself (migration 033). A week
 * off is seven rows, written in one statement. That keeps every question the
 * app actually asks — "is THIS day a holiday?" — a primary-key lookup rather
 * than a range containment test with an open end.
 *
 * `declaredBy` is NOT sent. A trigger stamps it from the caller's own token,
 * the same rule `submit_duty` follows for `submitted_by`: a holiday cancels
 * other people's duties, so the name beside it has to be whoever really
 * pressed the button, not whatever the client claimed.
 */

export const fromRow = (r) =>
  r && {
    day: r.day,
    label: r.label,
    // true  — classes are off, the boarders are still here and the
    //         residential checkpoints still run
    // false — the campus is closed and nothing at all is marked
    hostelCheckpoints: r.hostel_checkpoints !== false,
    note: r.note || "",
    declaredBy: r.declared_by || null,
    declaredAt: r.declared_at || null,
  };

/**
 * The holiday on one day, or null.
 *
 * `maybeSingle`, not `single`: not being a holiday is the normal answer for
 * 340 days of the year, and `single` reports it as an error — which would put
 * "could not load school data" in front of a teacher on an ordinary Tuesday.
 */
export async function fetchHoliday(day) {
  if (!day) return null;
  const { data, error } = await supabase
    .from("holidays")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  // A server that has not had migration 033 run yet has no `holidays` table,
  // and this function is called on every load of every screen. Throwing here
  // would take the whole app down over a calendar it does not have — so the
  // READ degrades to "no holiday", which is what that server means. The WRITE
  // below still surfaces the error, because a coordinator pressing Declare
  // must not be told it worked.
  if (error) {
    if (isNotDeployed(error)) return null;
    throw new Error(error.message);
  }
  return fromRow(data);
}

/** Every holiday from `from` onward, soonest first. Used by the calendar. */
export async function fetchHolidays(from) {
  const { data, error } = await supabase
    .from("holidays")
    .select("*")
    .gte("day", from)
    .order("day");
  if (error) {
    if (isNotDeployed(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map(fromRow);
}

/** Every day from `from` to `to` inclusive, as "YYYY-MM-DD". */
export function daysBetween(from, to) {
  const out = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const pad = (n) => String(n).padStart(2, "0");
  // Guarded rather than trusted: a reversed or malformed range would otherwise
  // spin until the app is killed. 180 is longer than any school break.
  for (let i = 0; i < 180; i += 1) {
    const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    out.push(iso);
    if (iso >= to) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Declare a holiday over a range of days, inclusive.
 *
 * `upsert`, so re-declaring a day that is already a holiday changes its label
 * and its hostel setting rather than failing on the primary key — which is
 * what "I meant classes-off, not campus-closed" looks like from the desk.
 *
 * Each row's insert fires the trigger that withdraws that day's pending
 * checkpoints, so the effect is immediate: a coordinator declaring tomorrow a
 * holiday at 4pm sees tomorrow's duties gone, rather than waiting on the
 * 00:30 job and reasonably concluding the button did nothing.
 */
export async function declareHoliday({ from, to, label, hostelCheckpoints, note }) {
  const days = daysBetween(from, to || from);
  const rows = days.map((day) => ({
    day,
    label,
    hostel_checkpoints: !!hostelCheckpoints,
    note: note || null,
  }));

  const { data, error } = await supabase
    .from("holidays")
    .upsert(rows, { onConflict: "day" })
    .select();
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

/**
 * Cancel a holiday. The delete fires the same trigger, which rebuilds the
 * day's checkpoints — so "we're having school after all" is one tap and the
 * registers come back.
 *
 * Registers that were already SUBMITTED on that day were never deleted in the
 * first place (migration 033 only ever withdraws pending duties), so nothing
 * here can resurrect or destroy a roll call.
 */
export async function cancelHoliday(day) {
  const { error } = await supabase.from("holidays").delete().eq("day", day);
  if (error) throw new Error(error.message);
}
