import { supabase } from "./supabase";
import { fromRow as studentFromRow } from "./students";

/**
 * Duties, and resolving each one to the students it covers.
 *
 * Group resolution mirrors SRS §3: a duty targets a class-section, a grade
 * band, residential-only, or the whole school. The rules live here rather
 * than in a screen so the marking screen and the roster agree on who is in a
 * group — a disagreement there would mean a child silently missing from a
 * roll call.
 */

const BANDS = {
  Primary: [2, 5],
  Middle: [6, 8],
  Senior: [9, 12],
};

/** Day scholars are excluded from residential-only checkpoints (SRS S6). */
const isResidential = (row) => row.stype !== "Day Scholar";

export const fromRow = (r) => ({
  id: r.id,
  checkpointId: r.checkpoint_id,
  checkpoint: r.checkpoints?.name || r.checkpoint_id,
  start: r.checkpoints?.start_min ?? 0,
  end: r.checkpoints?.end_min ?? 0,
  day: r.day,
  group: r.group_label,
  classKey: r.class_key || null,
  scope: r.scope || null,
  band: r.band || null,
  staffId: r.staff_id,
  state: r.state,
  submittedBy: r.submitted_by || null,
  submittedAt: r.submitted_at || null,
  correctedBy: r.corrected_by || null,
  correctedAt: r.corrected_at || null,
  mandatoryEscalation: !!r.mandatory_escalation,
});

/**
 * Today's duties, with their checkpoint's name and time window joined in.
 *
 * Falls back to the most recent day that HAS duties when today has none.
 * That is a stand-in for the nightly `cron-generate-duties` job, which does
 * not exist yet — without it the app shows an empty list every morning and
 * looks broken. Once that job runs, this fallback stops being reached.
 */
export async function fetchDuties(day) {
  const target = day || new Date().toISOString().slice(0, 10);

  const query = () =>
    supabase.from("duties").select("*, checkpoints(name, start_min, end_min)").order("id");

  let { data, error } = await query().eq("day", target);
  if (error) throw error;

  if (!data?.length) {
    const latest = await supabase
      .from("duties")
      .select("day")
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.data?.day) {
      ({ data, error } = await query().eq("day", latest.data.day));
      if (error) throw error;
    }
  }

  return (data || []).map(fromRow);
}

/**
 * Which students a duty covers, resolved against the register.
 * Pure — takes the full student list so callers can fetch it once.
 */
export function resolveGroup(duty, students) {
  if (!duty || !students?.length) return [];

  let pool = students;

  if (duty.classKey) {
    pool = pool.filter((s) => s.key === duty.classKey);
  } else if (duty.band && BANDS[duty.band]) {
    const [min, max] = BANDS[duty.band];
    pool = pool.filter((s) => s.grade >= min && s.grade <= max);
  }

  if (duty.scope === "res") pool = pool.filter((s) => s.type !== "D");

  return [...pool].sort(
    (a, b) => a.grade - b.grade || (a.roll || 0) - (b.roll || 0) || a.name.localeCompare(b.name)
  );
}

/** Attendance already recorded for a duty, as { admissionNo: statusCode }. */
export async function fetchAttendance(dutyId) {
  const { data, error } = await supabase
    .from("attendance")
    .select("admission_no, status")
    .eq("duty_id", dutyId);
  if (error) throw error;

  const map = {};
  (data || []).forEach((r) => {
    // A null status means Present, which is stored as the absence of a value.
    if (r.status) map[r.admission_no] = r.status;
  });
  return map;
}

/**
 * Save a submission and lock the duty — one atomic call (migrations/010).
 *
 * This used to be two statements from the app: upsert the marks, then flip the
 * duty to 'submitted'. Losing signal between them left attendance saved
 * against a duty that still read 'pending' — a checkpoint that looks unmarked
 * but is full of marks, which nobody would notice until it escalated.
 *
 * The same call handles a correction to an already-submitted record. Which one
 * happens is decided by the database from the duty's own state, not by the
 * caller, so the app cannot ask for the wrong one.
 *
 * `submitted_by` is NOT passed: the function reads it from the caller's token,
 * so this app can no longer name somebody else as the person who marked a
 * checkpoint.
 *
 * @returns { marked, changed, absent } — `changed` is 0 when a correction
 *          altered nothing, which the marking screen uses to skip the write.
 */
export async function submitDuty({ dutyId, students, statuses }) {
  const marks = students.map((s) => ({
    admission_no: s.adm,
    status: statuses[s.id] || null, // null = Present
  }));

  const { data, error } = await supabase.rpc("submit_duty", {
    p_duty_id: dutyId,
    p_marks: marks,
  });
  if (error) throw new Error(error.message);

  // The function returns a single row; PostgREST wraps it in an array.
  return data?.[0] || { marked: 0, changed: 0, absent: 0 };
}

/**
 * Overrule a submitted record (SRS A6).
 *
 * Delegates to `submit_duty`, which branches on the duty's state. Passing the
 * whole group rather than only the changed marks is safe and simpler: the
 * audit trigger skips rows whose status did not actually change, so a
 * correction touching one child still writes exactly one audit entry.
 */
export async function overrideAttendance({ dutyId, students, statuses }) {
  const result = await submitDuty({ dutyId, students, statuses });
  return result.changed;
}

/** Reassign a duty for today only; the recurring default is untouched (B2). */
export async function reassignDuty(dutyId, staffId) {
  const { error } = await supabase.from("duties").update({ staff_id: staffId }).eq("id", dutyId);
  if (error) throw new Error(error.message);
}
