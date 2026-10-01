/**
 * Who is allowed to do what.
 *
 * These predicates were previously scattered as inline `role === "teacher"` and
 * `["coordinator","admin"].includes(role)` checks across the navigator and four
 * screens, which is how the Duties tab ended up hidden from Management while
 * the Dashboard still told them to go and mark a checkpoint.
 *
 * The app-side check is for what the interface OFFERS. The database enforces
 * the same rules independently in `supabase/migrations/002` and `005` — these
 * functions are not the security boundary and must never be the only check.
 */

export const ROLES = {
  TEACHER: "teacher",
  COORDINATOR: "coordinator",
  MANAGEMENT: "management",
  ADMIN: "admin",
  NURSE: "nurse",
  RECEPTION: "reception",
};

/**
 * NOTE: the requirements talk about the "MOD" (Master on Duty) as a distinct
 * recipient of alerts, but the schema has no `mod` role — `management` is the
 * closest existing one and is labelled accordingly. If MOD needs to be its own
 * role (its own login, its own rota), that is a schema change and a decision
 * for the school, not something to invent here.
 */
export const ROLE_LABELS = {
  teacher: "Teacher",
  coordinator: "Coordinator",
  management: "MOD / Management",
  admin: "Administrator",
  nurse: "Nurse",
  reception: "Reception",
};

/** Always use this rather than indexing ROLE_LABELS directly: a role that is
 *  in the database but not in the map above would otherwise render as
 *  `undefined`, and crash outright wherever the label is searched or lowercased. */
export const roleLabel = (role) => ROLE_LABELS[role] || role || "Staff";

/** Roles that see the whole school by default rather than their own duties. */
export const OVERSIGHT = [ROLES.COORDINATOR, ROLES.MANAGEMENT, ROLES.ADMIN];

export const isOversight = (role) => OVERSIGHT.includes(role);

/**
 * Can open a checkpoint and submit it — including covering for someone else.
 *
 * Nurse and reception are both excluded, for the same reason: each holds a
 * record of their own — the sick bay, the gate register — and reads the board,
 * but neither files a class register.
 *
 * Migration 034 enforces this independently. Until it landed, this line was
 * the ONLY thing stopping the nurse: 005 widened attendance writes to "any
 * staff member" for cover marking, so the database would have accepted a
 * submission from a hand-rolled request with a nurse's token.
 */
export const canMark = (role) => role !== ROLES.NURSE && role !== ROLES.RECEPTION;

/** Moving a duty to a different teacher for the day (SRS B2). */
export const canReassign = (role) => role === ROLES.COORDINATOR || role === ROLES.ADMIN;

/**
 * Overruling a teacher's already-submitted attendance (SRS A6).
 *
 * Deliberately wider than `canReassign`: correcting a mark and moving a duty
 * to a different teacher are different authorities. The MOD and the
 * Principal's office are the people an absence escalates to and the people a
 * parent rings, so they can fix a record but still cannot re-roster anyone.
 *
 * Enforced independently by `can_override()` in migrations/006 — every change
 * is written to `audit_log` by a trigger there, so an override is never
 * silent whatever the app does.
 */
export const canOverride = (role) => isOversight(role);

/** Closing a safety alert with a written remark (SRS F4). */
export const canCloseAlerts = (role) => isOversight(role);

/**
 * Printing the school-wide headcount.
 *
 * A class teacher already prints their own class from "My Class"; this is the
 * sheet that spans every checkpoint and every child, so it follows oversight
 * rather than being granted separately. The nurse is excluded for the same
 * reason they cannot close an alert — they read the board, they do not file
 * the record.
 *
 * Not a security boundary: the marks themselves are readable school-wide by
 * any staff login since migration 005, and `attendance_headcount` counts under
 * the caller's own RLS. This decides who is OFFERED the button.
 */
export const canPrintReports = (role) => isOversight(role);

/**
 * Deciding an access request — turning somebody who signed up into staff.
 *
 * Coordinator and admin, deliberately NOT management. Approving is the act
 * that creates a login, and the person who does it is the one whose name ends
 * up in the audit log beside it; the MOD reads the board, they do not staff
 * the school.
 *
 * What an approval can GRANT is not decided here and cannot be: migration 013
 * hardcodes the new row's role to `teacher` and offers no parameter for
 * anything else. A coordinator cannot mint a coordinator however this
 * predicate is edited, which is the point of putting that rule in the
 * database rather than in this file.
 */
export const canApproveStaff = (role) => role === ROLES.COORDINATOR || role === ROLES.ADMIN;

/**
 * Declaring a holiday — a day the school does not take a register.
 *
 * Coordinator and admin, deliberately NOT management, for the same reason
 * `canApproveStaff` excludes them: the MOD reads the board, they do not set
 * the school's calendar. A holiday cancels every other teacher's duties for
 * that day, so it belongs with the people who roster them.
 *
 * Enforced independently by the `holidays_write` policy in migration 033.
 * Note that policy carries both USING and WITH CHECK — `for all` without a
 * WITH CHECK leaves INSERT unguarded entirely, which would have let any
 * signed-in teacher declare the school shut.
 */
export const canDeclareHoliday = (role) =>
  role === ROLES.COORDINATOR || role === ROLES.ADMIN;

/**
 * Working the gate desk: signing a student out to family and back in again.
 *
 * Reception's whole job. Coordinator and admin are included because the desk
 * is not staffed at 10pm and somebody senior has to be able to sign a child
 * back in — not because this is an oversight function. Management is excluded
 * on purpose: this records a child physically leaving the campus, and the
 * person who writes it should be the person who watched them go.
 *
 * `sign_student_out` and `sign_student_in` in migration 034 check the same
 * three roles; this decides who is offered the screen.
 */
export const canWorkGate = (role) =>
  role === ROLES.RECEPTION || role === ROLES.COORDINATOR || role === ROLES.ADMIN;

/** Whether the Duties list should default to "my duties only". */
export const defaultsToOwnDuties = (role) => role === ROLES.TEACHER;
