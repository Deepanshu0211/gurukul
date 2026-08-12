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
};

/** Always use this rather than indexing ROLE_LABELS directly: a role that is
 *  in the database but not in the map above would otherwise render as
 *  `undefined`, and crash outright wherever the label is searched or lowercased. */
export const roleLabel = (role) => ROLE_LABELS[role] || role || "Staff";

/** Roles that see the whole school by default rather than their own duties. */
export const OVERSIGHT = [ROLES.COORDINATOR, ROLES.MANAGEMENT, ROLES.ADMIN];

export const isOversight = (role) => OVERSIGHT.includes(role);

/** Can open a checkpoint and submit it — including covering for someone else. */
export const canMark = (role) => role !== ROLES.NURSE;

/** Moving a duty to a different teacher for the day (SRS B2). */
export const canReassign = (role) => role === ROLES.COORDINATOR || role === ROLES.ADMIN;

/** Closing a safety alert with a written remark (SRS F4). */
export const canCloseAlerts = (role) => isOversight(role);

/** Whether the Duties list should default to "my duties only". */
export const defaultsToOwnDuties = (role) => role === ROLES.TEACHER;
