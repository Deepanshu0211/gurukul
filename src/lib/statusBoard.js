import { supabase } from "./supabase";

/**
 * The Morning Attendance Report, on screen.
 *
 * The school signs a paper form every morning with nine count columns per
 * class. `class_status_board` (migration 020) computes exactly those columns;
 * this maps them to camelCase and adds the two things a screen needs that a
 * database row does not carry — a total line, and the reader's own class.
 *
 * Deliberately separate from `reportData.js`. That module builds documents for
 * printing and its shapes are dictated by `reportHtml.js`; this one answers an
 * on-screen question. Sharing a module would mean a change for the screen
 * could alter a sheet the school files.
 */

/** The school's own column headings, and what each one counts. Shown in the
 *  sheet so nobody has to remember which bucket a status falls in. */
export const COLUMNS = [
  { key: "resPresent", short: "Res P", label: "Residential present" },
  { key: "dayPresent", short: "Day P", label: "Day scholar present" },
  { key: "resAbsent", short: "Res A", label: "Residential absent" },
  { key: "dayAbsent", short: "Day A", label: "Day scholar absent" },
  { key: "sick", short: "Sick", label: "In the infirmary" },
  { key: "notReported", short: "Not rep.", label: "Not reported / at home" },
];

const fromRow = (r) => ({
  grade: r.grade,
  section: r.section,
  classKey: r.class_key,
  classLabel: r.class_label,
  teacher: r.teacher || null,
  res: Number(r.res) || 0,
  day: Number(r.day_scholars) || 0,
  strength: Number(r.strength) || 0,
  resPresent: Number(r.res_present) || 0,
  dayPresent: Number(r.day_present) || 0,
  resAbsent: Number(r.res_absent) || 0,
  dayAbsent: Number(r.day_absent) || 0,
  sick: Number(r.sick) || 0,
  notReported: Number(r.not_reported) || 0,
  onDuty: Number(r.on_duty) || 0,
  unmarked: Number(r.unmarked) || 0,
  submitted: !!r.submitted,
  submittedAt: r.submitted_at || null,
});

/** The Total row the paper form has at the foot of the table. */
export const totalOf = (rows) => {
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return {
    classKey: "__total__",
    classLabel: "Total",
    teacher: null,
    res: sum("res"),
    day: sum("day"),
    strength: sum("strength"),
    resPresent: sum("resPresent"),
    dayPresent: sum("dayPresent"),
    resAbsent: sum("resAbsent"),
    dayAbsent: sum("dayAbsent"),
    sick: sum("sick"),
    notReported: sum("notReported"),
    onDuty: sum("onDuty"),
    unmarked: sum("unmarked"),
    // A total is only "submitted" when every class it adds up is, otherwise it
    // reads as a complete morning while three classes are still blank.
    submitted: rows.length > 0 && rows.every((r) => r.submitted),
    submittedAt: null,
  };
};

/**
 * Every class's counts for one day and checkpoint.
 *
 * No pagination: eighteen classes is eighteen rows, and the database has
 * already done the counting. This is the whole reason 020 is SQL — the same
 * answer computed in the client is seven thousand attendance rows fetched
 * across eight requests to produce one screen of numbers.
 */
export async function fetchStatusBoard(day, checkpoint = "morning") {
  const { data, error } = await supabase.rpc("class_status_board", {
    p_day: day,
    p_checkpoint: checkpoint,
  });
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

/**
 * The reader's own class, or null.
 *
 * `classKey` comes from the staff row. Duty staff and oversight have none, and
 * null is the ordinary answer for them rather than a failure — the caller
 * shows the whole board instead.
 */
export const ownRow = (rows, classKey) =>
  (classKey && rows.find((r) => r.classKey === classKey)) || null;
