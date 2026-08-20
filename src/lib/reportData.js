import { supabase } from "./supabase";

/**
 * Gathering what a printed report needs.
 *
 * Everything here reads `attendance_detail` (migrations/009) so the printed
 * sheet and the on-screen record are computed from the same join. A report
 * that disagrees with the app is worse than no report.
 *
 * Two things shape the queries:
 *
 *  - Postgrest caps a response at 1000 rows. A single day is 700 students ×
 *    up to ten checkpoints, so the full grid has to be paged.
 *  - Present is stored as a NULL status, so `status not null` returns ONLY
 *    the exceptions — a few dozen rows for a whole week instead of forty
 *    thousand. The week report is built entirely out of that, which is what
 *    keeps it usable on school wi-fi.
 */

const PAGE = 1000;

/** Pages through a query until it stops returning full pages. */
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
    // A register that grows past this is a different problem than a report.
    if (out.length >= 50000) return out;
  }
}

const detail = () => supabase.from("attendance_detail").select("*");

/**
 * One day, in full: every mark, so the sheet can show a student × checkpoint
 * grid rather than only the exceptions.
 */
export async function fetchDayReport(day) {
  const rows = await fetchAll(() => detail().eq("day", day).order("start_min").order("roll_no"));

  const checkpoints = [];
  const seen = new Set();
  const students = new Map();

  for (const r of rows) {
    if (!seen.has(r.duty_id)) {
      seen.add(r.duty_id);
      checkpoints.push({
        dutyId: r.duty_id,
        name: r.checkpoint,
        startMin: r.start_min,
        group: r.group_label,
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        correctedBy: r.corrected_by,
      });
    }

    let s = students.get(r.admission_no);
    if (!s) {
      s = {
        admissionNo: r.admission_no,
        name: r.student,
        roll: r.roll_no,
        grade: r.grade,
        section: r.section,
        classLabel: `${r.grade} ${r.section}`,
        marks: {},
      };
      students.set(r.admission_no, s);
    }
    s.marks[r.duty_id] = { status: r.status, label: r.status_label, present: r.present };
  }

  checkpoints.sort((a, b) => a.startMin - b.startMin);

  return {
    day,
    checkpoints,
    students: [...students.values()].sort(
      (a, b) => a.grade - b.grade || (a.roll || 0) - (b.roll || 0) || a.name.localeCompare(b.name)
    ),
  };
}

/**
 * A date range, exceptions only.
 *
 * A week of full marks is tens of thousands of rows for a sheet on which
 * almost every cell would read "present". The totals come from a count
 * instead, and only the exceptions are listed by name — which is also the
 * only part anyone reads.
 */
export async function fetchRangeReport(from, to) {
  const rows = await fetchAll(() =>
    detail().gte("day", from).lte("day", to).not("status", "is", null).order("day").order("start_min")
  );

  // Marks per day, so a percentage has a denominator. `head: true` asks for
  // the count without the rows.
  const { count: totalMarks, error } = await supabase
    .from("attendance_detail")
    .select("*", { count: "exact", head: true })
    .gte("day", from)
    .lte("day", to);
  if (error) throw new Error(error.message);

  const byDay = new Map();
  const byStudent = new Map();

  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);

    let s = byStudent.get(r.admission_no);
    if (!s) {
      s = {
        admissionNo: r.admission_no,
        name: r.student,
        roll: r.roll_no,
        grade: r.grade,
        section: r.section,
        classLabel: `${r.grade} ${r.section}`,
        days: {},
        absent: 0,
        elsewhere: 0,
      };
      byStudent.set(r.admission_no, s);
    }
    s.days[r.day] = (s.days[r.day] || 0) + 1;
    if (r.status === "A") s.absent += 1;
    else s.elsewhere += 1;
  }

  return {
    from,
    to,
    days: [...byDay.keys()].sort(),
    exceptions: rows,
    totalMarks: totalMarks || 0,
    // Worst first — this list exists to be acted on, not filed.
    students: [...byStudent.values()].sort(
      (a, b) => b.absent - a.absent || b.elsewhere - a.elsewhere || a.name.localeCompare(b.name)
    ),
  };
}
