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
 * Save a submission and lock the duty.
 *
 * Writes a row for EVERY student in the group, including present ones, so
 * report queries stay simple and "was this child checked at all?" is
 * answerable — the whole point of the night reconciliation (SRS F3).
 *
 * Not yet atomic: two statements, so a crash between them could leave
 * attendance saved with the duty still pending. Moving this into a
 * `submit_duty` Postgres function is the fix, and is why the guide specifies
 * one (self-build-guide §4).
 */
export async function submitDuty({ dutyId, students, statuses, staffId }) {
  const rows = students.map((s) => ({
    duty_id: dutyId,
    admission_no: s.adm,
    status: statuses[s.id] || null, // null = Present
  }));

  const { error: attErr } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "duty_id,admission_no" });
  if (attErr) throw new Error(attErr.message);

  const { error: dutyErr } = await supabase
    .from("duties")
    .update({
      state: "submitted",
      submitted_by: staffId,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", dutyId);
  if (dutyErr) throw new Error(dutyErr.message);
}

/**
 * Overrule a submitted record (SRS A6).
 *
 * Writes only the marks that actually CHANGED. `submitDuty` writes a row per
 * student, so re-writing all of them would put one audit row per child in the
 * group for a correction that touched one — and the log is the whole point of
 * the feature, so it has to stay readable.
 *
 * `submitted_by` is left alone on purpose: the teacher who marked the
 * checkpoint stays its author, and `corrected_by` records who amended it.
 * Collapsing the two would erase who originally got it wrong, which is
 * exactly what a correction trail exists to preserve.
 *
 * Returns the number of marks changed, for the confirmation message.
 */
export async function overrideAttendance({ dutyId, students, statuses, before, staffId }) {
  const changed = students.filter(
    (s) => (statuses[s.id] || null) !== (before[s.id] || null)
  );
  if (!changed.length) return 0;

  const { error } = await supabase.from("attendance").upsert(
    changed.map((s) => ({
      duty_id: dutyId,
      admission_no: s.adm,
      status: statuses[s.id] || null, // null = Present
    })),
    { onConflict: "duty_id,admission_no" }
  );
  if (error) throw new Error(error.message);

  const { error: dutyErr } = await supabase
    .from("duties")
    .update({ corrected_by: staffId, corrected_at: new Date().toISOString() })
    .eq("id", dutyId);
  if (dutyErr) throw new Error(dutyErr.message);

  return changed.length;
}

/** Reassign a duty for today only; the recurring default is untouched (B2). */
export async function reassignDuty(dutyId, staffId) {
  const { error } = await supabase.from("duties").update({ staff_id: staffId }).eq("id", dutyId);
  if (error) throw new Error(error.message);
}
