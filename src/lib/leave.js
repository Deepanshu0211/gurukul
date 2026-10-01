import { supabase } from "./supabase";
import { isNotDeployed } from "./errors";

/**
 * The gate register — a student signed out to family, and signed back in.
 *
 * Every write here is an RPC, never a table write, for the same reason as
 * `access.js`: `student_leave` has no INSERT or UPDATE policy at all
 * (migration 034), so the client cannot choose who signed a child out, when,
 * or whether they are back. The indirection is the security model, not
 * ceremony.
 *
 * What a leave DOES is enforced entirely in the database: while a row is open,
 * a trigger records that student with the leave's status at every checkpoint
 * from the day they left, whatever the app sends. The marking screen pre-fills
 * and locks the row so the teacher sees the truth rather than being quietly
 * corrected — but if that screen were wrong, the register would still be right.
 */

export const fromRow = (r) =>
  r && {
    id: r.id,
    adm: r.admission_no,
    status: r.status,
    reason: r.reason || "",
    outDay: r.out_day,
    outAt: r.out_at,
    outBy: r.out_by || null,
    expectedBack: r.expected_back || null,
    backDay: r.back_day || null,
    inAt: r.in_at || null,
    inBy: r.in_by || null,
    open: !r.in_at,
  };

/**
 * Everyone currently off campus, as `{ [admissionNo]: leave }`.
 *
 * A map rather than a list because every caller is asking about one child:
 * the marking screen looks up 300 students per render, and a linear scan of
 * the open leaves for each of them is the kind of thing that shows up as
 * scroll stutter on the phones this runs on.
 */
export async function fetchOpenLeaves() {
  const { data, error } = await supabase
    .from("student_leave")
    .select("*")
    .is("in_at", null)
    .order("out_at", { ascending: false });
  // Same reasoning as `fetchHoliday`: this loads on every screen, and a server
  // without migration 034 has no gate register. "Nobody is signed out" is that
  // server's honest answer, and it leaves marking working exactly as it did
  // before this feature existed. The two RPCs below still throw.
  if (error) {
    if (isNotDeployed(error)) return {};
    throw new Error(error.message);
  }

  const map = {};
  (data || []).forEach((r) => {
    map[r.admission_no] = fromRow(r);
  });
  return map;
}

/** One student's trips off campus, most recent first. For their record card. */
export async function fetchLeaveHistory(adm, limit = 20) {
  const { data, error } = await supabase
    .from("student_leave")
    .select("*")
    .eq("admission_no", adm)
    .order("out_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isNotDeployed(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map(fromRow);
}

/**
 * Sign a student out at the gate.
 *
 * `status` must be a spanning one — Home, Sick, Outing, Gita Nagari. The
 * database refuses the others and says why: Activity and Self study are things
 * that happen ON campus and end when the checkpoint does, so a child signed
 * out under one would carry it forever with nothing to clear it.
 */
export async function signStudentOut({ adm, status = "H", reason, expectedBack }) {
  const { data, error } = await supabase.rpc("sign_student_out", {
    p_adm: adm,
    p_status: status,
    p_reason: reason || null,
    p_expected: expectedBack || null,
  });
  if (error) throw new Error(error.message);
  return fromRow(Array.isArray(data) ? data[0] : data);
}

/**
 * Sign them back in. This is the ONLY thing that ends a leave.
 *
 * Not the expected return date, and not a teacher deciding the child looks
 * present — a child who was due back on Sunday and did not arrive must keep
 * reading as away, because that is the truth, and because the alternative
 * silently returns a child nobody has seen.
 */
export async function signStudentIn(adm) {
  const { data, error } = await supabase.rpc("sign_student_in", { p_adm: adm });
  if (error) throw new Error(error.message);
  return fromRow(Array.isArray(data) ? data[0] : data);
}
