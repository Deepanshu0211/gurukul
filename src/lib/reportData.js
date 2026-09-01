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

/**
 * The coordinator's sheet: counts per checkpoint, and names only for the marks
 * that are not "present".
 *
 * Two requests regardless of range. The totals come from `attendance_headcount`
 * (migration 011), which groups server-side — a day is seven thousand marks and
 * fetching them to add up in the client is eight round trips for eight numbers.
 * The exceptions are fetched in full because they are the only rows anyone
 * reads by name, and there are a few dozen of them in a week.
 */
export async function fetchHeadcountReport(from, to) {
  const { data, error } = await supabase.rpc("attendance_headcount", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);

  // PostgREST serialises bigint counts as JSON numbers, but a driver that ever
  // hands them back as strings would turn every total into concatenation.
  const checkpoints = (data || []).map((r) => ({
    day: r.day,
    dutyId: r.duty_id,
    name: r.checkpoint,
    startMin: r.start_min,
    group: r.group_label,
    strength: Number(r.strength),
    present: Number(r.present),
    absent: Number(r.absent),
    elsewhere: Number(r.elsewhere),
  }));

  const exceptions = await fetchAll(() =>
    detail()
      .gte("day", from)
      .lte("day", to)
      .not("status", "is", null)
      .order("day")
      .order("start_min")
      .order("roll_no")
  );

  const totals = checkpoints.reduce(
    (t, c) => ({
      strength: t.strength + c.strength,
      present: t.present + c.present,
      absent: t.absent + c.absent,
      elsewhere: t.elsewhere + c.elsewhere,
    }),
    { strength: 0, present: 0, absent: 0, elsewhere: 0 }
  );

  // How many of each reason. Counted from the exception rows already in hand
  // rather than a second query, and labelled with `status_label` so the sheet
  // prints the school's own wording rather than a letter.
  const reasons = new Map();
  for (const r of exceptions) {
    const hit = reasons.get(r.status) || { status: r.status, label: r.status_label, marks: 0 };
    hit.marks += 1;
    reasons.set(r.status, hit);
  }

  return {
    from,
    to,
    days: [...new Set(checkpoints.map((c) => c.day))].sort(),
    checkpoints,
    exceptions,
    totals,
    // Absent leads whatever its count, because it is the only one that means
    // nobody knows where the child is. The rest follow by size.
    byReason: [...reasons.values()].sort((a, b) =>
      a.status === "A" ? -1 : b.status === "A" ? 1 : b.marks - a.marks
    ),
  };
}

/** The checkpoint the Saturday assembly sheet reports on. */
export const SATURDAY_CHECKPOINT = "morning";

/**
 * The Saturday morning assembly sheet — the school's own ruled page,
 * generated from the marks instead of filled in by hand.
 *
 * All of the counting is `saturday_report` (migration 017), which returns one
 * row per printed row and nothing else: twelve rows for a school of seven
 * hundred, so there is no paging here and no arithmetic in the client. The
 * only reason to touch the database twice is the state of the checkpoint
 * itself — a sheet has to be able to say "this was never submitted" rather
 * than print a page of zeros that reads like an empty school.
 */
export async function fetchSaturdayReport(day, checkpointId = SATURDAY_CHECKPOINT) {
  const { data, error } = await supabase.rpc("saturday_report", {
    p_day: day,
    p_checkpoint: checkpointId,
  });
  if (error) throw new Error(error.message);

  // Same guard as the headcount: bigint counts arrive as JSON numbers today,
  // but a driver that ever handed them back as strings would turn every
  // total on a signed sheet into concatenation.
  const rows = (data || []).map((r) => ({
    band: r.band,
    bandOrder: r.band_order,
    house: r.house,
    houseOrder: r.house_order,
    res: Number(r.res),
    day: Number(r.day_scholars),
    strength: Number(r.strength),
    resPresent: Number(r.res_present),
    dayPresent: Number(r.day_present),
    resAbsent: Number(r.res_absent),
    dayAbsent: Number(r.day_absent),
    sick: Number(r.sick),
    notReported: Number(r.not_reported),
    onDuty: Number(r.on_duty),
    unmarked: Number(r.unmarked),
  }));

  const FIELDS = [
    "res",
    "day",
    "strength",
    "resPresent",
    "dayPresent",
    "resAbsent",
    "dayAbsent",
    "sick",
    "notReported",
    "onDuty",
    "unmarked",
  ];
  const totals = rows.reduce(
    (t, r) => {
      FIELDS.forEach((f) => (t[f] += r[f]));
      return t;
    },
    Object.fromEntries(FIELDS.map((f) => [f, 0]))
  );

  // Was the checkpoint marked at all? A Saturday whose duty nobody submitted
  // still prints — with the class strengths and empty count columns — which
  // is exactly the blank form somebody would otherwise have gone looking for.
  const { data: duties, error: dutyErr } = await supabase
    .from("duties")
    .select("state, submitted_at, checkpoints(name, start_min)")
    .eq("day", day)
    .eq("checkpoint_id", checkpointId);
  if (dutyErr) throw new Error(dutyErr.message);

  const list = duties || [];

  return {
    day,
    rows,
    totals,
    checkpoint: list[0]?.checkpoints?.name || "Morning attendance",
    startMin: list[0]?.checkpoints?.start_min ?? null,
    // The morning checkpoint may be split across several duties (one per
    // band), so the sheet is only complete when every one of them is in.
    duties: list.length,
    submitted: list.filter((d) => d.state === "submitted").length,
  };
}
