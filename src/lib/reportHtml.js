import { fmtTime, fmtDay, fmtDayNumeric, weekdayOf, plural } from "../utils/format";

/**
 * The printed attendance sheet.
 *
 * A pure function from data to an HTML string — no React, no side effects —
 * so the layout can be reasoned about and checked without a device.
 *
 * ONE FIXED TYPE SCALE, ONE COLUMN, ALWAYS.
 *
 * An earlier version chose its type size and column count from the size of
 * the roster, to hold every report to five pages. It met that budget and was
 * the wrong trade: body text landed anywhere between 6.5pt and 8pt, the
 * register ran in two, three or four columns, and every heading was sized
 * relative to the body — so two reports printed on the same morning did not
 * look like the same document, and the large ones were too small to read
 * comfortably.
 *
 * Page count is now whatever it needs to be. A single column at 10pt fits
 * about 45 students per page: a class of 30 is one page, the whole school is
 * fifteen. Fifteen readable pages beat five that need good light and a steady
 * hand, and a sheet that always looks the same is one people can learn to
 * read at a glance.
 *
 * Checkpoints are numbered rather than abbreviated. Two-letter codes collide
 * on a real timetable — "Mangalarati" and "Morning attendance" are both MA —
 * and the numbers key back to the table directly above them.
 */

/** The whole scale. Nothing here is computed from anything else. */
const TYPE = {
  h1: 15,
  h2: 11,
  body: 10,
  small: 9,
};

/** A4 portrait at 12mm margins leaves 186 × 273mm. */
const PAGE_MARGIN_MM = 12;

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Guards the one-line row height. Generous — there is room in one column. */
const clip = (s, n = 34) => {
  const t = String(s ?? "");
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};

/**
 * Every cell carries a letter, including present ones. A dot for present and
 * letters for everything else meant two kinds of mark in one grid, which is
 * exactly the inconsistency this rewrite is removing. P is quiet enough in
 * grey; only the exceptions are set in black.
 */
const markCell = (mark) => {
  if (!mark) return { text: "—", cls: "none" };
  if (mark.present) return { text: "P", cls: "present" };
  if (mark.status === "A") return { text: "A", cls: "absent" };
  return { text: esc(mark.status), cls: "other" };
};

const CSS = `
  @page { size: A4 portrait; margin: ${PAGE_MARGIN_MM}mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: ${TYPE.body}pt;
    line-height: 1.3;
    color: #000;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1 { font-size: ${TYPE.h1}pt; font-weight: 700; margin: 0 0 2mm; }
  h2 {
    font-size: ${TYPE.h2}pt;
    font-weight: 700;
    margin: 5mm 0 2mm;
    padding-bottom: 1mm;
    border-bottom: 0.5mm solid #000;
    /* A heading stranded at the foot of a page is worse than an early break. */
    page-break-after: avoid;
  }
  .sub { font-size: ${TYPE.body}pt; color: #444; margin: 0 0 2mm; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th {
    font-size: ${TYPE.small}pt;
    font-weight: 700;
    text-align: left;
    border-bottom: 0.4mm solid #000;
    padding: 1mm 1.5mm;
    white-space: nowrap;
  }
  td {
    font-size: ${TYPE.body}pt;
    padding: 0.9mm 1.5mm;
    border-bottom: 0.2mm solid #ddd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tbody tr { page-break-inside: avoid; }
  /* A totals row belongs at the end, once. The print default for tfoot is
     table-footer-group, which repeats it on every page — the same numbers
     under a partial table, which reads as a page total that it is not. */
  tfoot { display: table-row-group; }
  tfoot td {
    border-top: 0.4mm solid #000;
    border-bottom: none;
    font-weight: 700;
  }

  .num { text-align: right; }
  .c   { text-align: center; }

  /* Present is the background state and is set back in grey; an exception is
     black and bold, so a page of marks can be scanned for trouble alone. */
  .present { color: #888; }
  .none    { color: #bbb; }
  .absent  { font-weight: 700; color: #000; }
  .other   { font-weight: 700; color: #000; }

  .legend {
    margin-top: 3mm;
    font-size: ${TYPE.small}pt;
    color: #444;
    line-height: 1.5;
  }
  /* The register's key is read before the grid, not after it, so it carries
     its space below and is never left stranded at the foot of a page. */
  .key {
    margin-top: 0;
    margin-bottom: 2mm;
    page-break-after: avoid;
  }
  .foot {
    margin-top: 6mm;
    padding-top: 2mm;
    border-top: 0.3mm solid #999;
    font-size: ${TYPE.small}pt;
    color: #555;
  }
  .none-row { font-size: ${TYPE.body}pt; color: #444; padding: 3mm 0; }

  /* ── THE SATURDAY ASSEMBLY SHEET ────────────────────────────────────────
     The only sheet here that is a FORM rather than a report: it is signed by
     three people and filed in a book, so it is fully ruled and its blank
     cells are meant to be written in. Everything under .form is scoped to it
     and changes nothing about the register or the headcount. */
  .form-title { text-align: center; font-size: ${TYPE.h2}pt; font-weight: 700; margin: 0; }
  .form-sub   { text-align: center; font-size: ${TYPE.body}pt; margin: 1mm 0 4mm; }
  .form-meta  { display: flex; justify-content: space-between; margin-bottom: 2mm; }
  .form-meta b { font-weight: 700; }

  table.form { border: 0.4mm solid #000; table-layout: fixed; }
  table.form th, table.form td {
    border: 0.25mm solid #000;
    text-align: center;
    padding: 1mm 0.5mm;
    /* The numbers are generated; the last two columns are not. Wrapping is
       what lets "Not Reported (Home) / GN" sit in a 20mm column. */
    white-space: normal;
    overflow: visible;
  }
  table.form th { font-size: 7pt; line-height: 1.15; vertical-align: middle; }
  /* Tall enough to sign in by hand — the two right-hand columns are blank on
     purpose and a printed form nobody can write on is just a screenshot. */
  table.form td { height: 10.5mm; font-size: ${TYPE.body}pt; }
  /* The one column that is text. nowrap keeps every row exactly one line
     tall, so the twelve rows are the same height as each other and as the
     ruled book this replaces — a wrapped "Primary Goverdhan" quietly makes
     its own row taller than the eleven around it. */
  table.form td.row-label { text-align: left; padding-left: 2mm; white-space: nowrap; }
  table.form tr.total td { font-weight: 700; border-top: 0.4mm solid #000; }
  /* Set smaller as well as italic: this row only exists while the house list
     is being filled in, its label is the longest on the sheet, and nowrap
     would otherwise push it out over the Res column. */
  table.form tr.unassigned td.row-label { font-style: italic; font-size: 8pt; }

  .play {
    margin-top: 3mm;
    border: 0.4mm solid #000;
    border-collapse: collapse;
    width: 100%;
  }
  .play td { border: 0.25mm solid #000; height: 10mm; padding: 1mm 2mm; font-size: ${TYPE.body}pt; }

  .signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 16mm;
  }
  .signatures div {
    width: 48mm;
    border-top: 0.25mm solid #000;
    padding-top: 1mm;
    text-align: center;
    font-size: ${TYPE.small}pt;
  }
  .note { margin-top: 3mm; font-size: ${TYPE.small}pt; color: #444; line-height: 1.5; }
  .warn { font-weight: 700; color: #000; }
`;

const header = (title, sub) => `<h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div>`;

const footer = (by) =>
  `<div class="foot">Generated ${esc(new Date().toLocaleString())}${
    by ? ` by ${esc(by)}` : ""
  } · Bhaktivedanta Gurukula &amp; International School</div>`;

const page = (bodyHtml) => `<style>${CSS}</style>${bodyHtml}`;

/** Marks that are not "present", listed in full — the actionable part. */
function exceptionsTable(rows, { showDay = false } = {}) {
  if (!rows.length) {
    return `<div class="none-row">Every student was present at every checkpoint.</div>`;
  }
  return `<table>
    <thead><tr>
      ${showDay ? '<th style="width:16%">Day</th>' : ""}
      <th style="width:9%">Roll</th>
      <th style="width:${showDay ? 29 : 37}%">Student</th>
      <th style="width:11%">Class</th>
      <th style="width:${showDay ? 21 : 27}%">Checkpoint</th>
      <th style="width:14%">Status</th>
    </tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
          ${showDay ? `<td>${esc(fmtDay(r.day))}</td>` : ""}
          <td class="num">${esc(r.roll_no ?? "")}</td>
          <td>${esc(clip(r.student))}</td>
          <td>${esc(r.grade)} ${esc(r.section)}</td>
          <td>${esc(clip(r.checkpoint, 24))}</td>
          <td class="${r.status === "A" ? "absent" : "other"}">${esc(r.status_label)}</td>
        </tr>`
      )
      .join("")}</tbody>
  </table>`;
}

/**
 * The full student × checkpoint grid. One column, one row per student, so the
 * sheet reads top to bottom like a register and the row a name sits on is the
 * row its marks sit on.
 */
/**
 * '6 KRISHNA' -> '6 Krishna'.
 *
 * The section is stored upper-case because that is how the school's own
 * spreadsheet had it, and shouting it on a printed page helps nobody. Grade
 * numbers and the single-section 'A' are left exactly as they are.
 */
const className = (label) =>
  String(label || "")
    .split(/\s+/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)
      ? w[0] + w.slice(1).toLowerCase()
      : w))
    .join(" ");

function registerTable(students, checkpoints) {
  // Numbered columns, keyed by the checkpoint table above. 7mm holds a single
  // bold character at 10pt with room either side.
  const heads = checkpoints
    .map((_, i) => `<th class="c" style="width:7mm">${i + 1}</th>`)
    .join("");

  const rows = students
    .map((s) => {
      const cells = checkpoints
        .map((c) => {
          const m = markCell(s.marks[c.dutyId]);
          return `<td class="c ${m.cls}">${m.text}</td>`;
        })
        .join("");
      return `<tr>
        <td class="num">${esc(s.roll ?? "")}</td>
        <td>${esc(className(s.classLabel))}</td>
        <td>${esc(clip(s.name))}</td>
        ${cells}
      </tr>`;
    })
    .join("");

  // Class before Student, and 26mm rather than 16mm.
  //
  // It used to sit last, squeezed between the name and the mark columns, and
  // 16mm truncated '6 Krishna' to '6 KRISH…'. There was never a shortage of
  // room — with one column per checkpoint the table uses 63mm of 186mm — so
  // the name was taking width it did not need while the class went without.
  // Reading order matches the register too: which class, then who.
  return `<table>
    <thead><tr>
      <th class="num" style="width:12mm">Roll</th>
      <th style="width:26mm">Class</th>
      <th>Student</th>
      ${heads}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const LEGEND = `<div class="legend key">
  <b>P</b> present &nbsp;&nbsp; <b>A</b> absent &nbsp;&nbsp; <b>H</b> home &nbsp;&nbsp;
  <b>S</b> sick &nbsp;&nbsp; <b>O</b> outing &nbsp;&nbsp; <b>G</b> Gita Nagari &nbsp;&nbsp;
  <b>V</b> activity &nbsp;&nbsp; <b>Y</b> self study &nbsp;&nbsp;
  <b>—</b> not in that checkpoint's group
</div>`;

/** One day: the checkpoint key, who was not present, then the full register. */
export function dayReportHtml({ day, checkpoints, students }, { generatedBy, classLabel } = {}) {
  const summaryRows = checkpoints
    .map((c, i) => {
      let marked = 0;
      let absent = 0;
      let elsewhere = 0;
      students.forEach((s) => {
        const m = s.marks[c.dutyId];
        if (!m) return;
        marked += 1;
        if (m.status === "A") absent += 1;
        else if (!m.present) elsewhere += 1;
      });
      // Who actually took it. The column used to be Group, which named one
      // of the eighteen duties behind a checkpoint and has been empty since
      // columns were keyed by checkpoint instead. Who filled the register in
      // is worth the space: a week covered by a substitute should say so on
      // the page the school signs, not only in the audit log.
      const who = c.takenBy
        ? esc(clip(c.takenBy, 22)) + (c.cover ? ' <span class="key">(cover)</span>' : "")
        : "";
      return `<tr>
        <td class="c"><b>${i + 1}</b></td>
        <td>${esc(c.name)}</td>
        <td>${esc(fmtTime(c.startMin))}</td>
        <td>${who}</td>
        <td class="num">${marked}</td>
        <td class="num">${marked - absent - elsewhere}</td>
        <td class="num">${absent}</td>
        <td class="num">${elsewhere}</td>
      </tr>`;
    })
    .join("");

  return page(
    `${header(
      "Attendance",
      [
        classLabel || null,
        fmtDay(day),
        `${students.length} ${students.length === 1 ? "student" : "students"}`,
        `${checkpoints.length} ${checkpoints.length === 1 ? "checkpoint" : "checkpoints"}`,
      ]
        .filter(Boolean)
        .join(" · ")
    )}

<h2>Checkpoints</h2>
<table>
  <thead><tr>
    <th class="c" style="width:8mm">#</th>
    <th style="width:26%">Checkpoint</th>
    <th style="width:12%">Time</th>
    <th style="width:26%">Taken by</th>
    <th class="num" style="width:9%">Marked</th>
    <th class="num" style="width:9%">Present</th>
    <th class="num" style="width:9%">Absent</th>
    <th class="num" style="width:9%">Else</th>
  </tr></thead>
  <tbody>${summaryRows}</tbody>
</table>

<h2>Register</h2>
${LEGEND}
${registerTable(students, checkpoints)}
${footer(generatedBy)}`
  );
}

/**
 * A date range. Only students with something to report are listed: a week of
 * 700 all-present children is forty thousand cells and nothing to act on.
 */
export function rangeReportHtml(
  { from, to, days, exceptions, totalMarks, students, takenBy = {} },
  { generatedBy, classLabel } = {}
) {
  const absent = exceptions.filter((e) => e.status === "A").length;

  const perDay = days
    .map((day) => {
      const rows = exceptions.filter((e) => e.day === day);
      // The question this answers: a class teacher goes on leave for three
      // days and somebody covers. The marks are the class's either way, so
      // without a name on the page there is nothing to show that the hand
      // changed — and the school signs these sheets.
      const who = (takenBy[day] || [])
        .map((t) => esc(t.name) + (t.cover ? " (cover)" : ""))
        .join(", ");
      return `<tr>
        <td>${esc(fmtDay(day))}</td>
        <td>${who}</td>
        <td class="num">${rows.filter((r) => r.status === "A").length}</td>
        <td class="num">${rows.filter((r) => r.status !== "A").length}</td>
      </tr>`;
    })
    .join("");

  const grid = students.length
    ? `<table>
        <thead><tr>
          <th class="num" style="width:12mm">Roll</th>
          <th style="width:26mm">Class</th>
          <th>Student</th>
          ${days.map((d) => `<th class="c" style="width:11mm">${esc(fmtDay(d).slice(0, 3))}</th>`).join("")}
          <th class="num" style="width:14mm">Absent</th>
        </tr></thead>
        <tbody>${students
          .map(
            (s) => `<tr>
              <td class="num">${esc(s.roll ?? "")}</td>
              <td>${esc(clip(s.name))}</td>
              <td>${esc(s.classLabel)}</td>
              ${days
                .map((d) =>
                  s.days[d]
                    ? `<td class="c other">${s.days[d]}</td>`
                    : `<td class="c present">P</td>`
                )
                .join("")}
              <td class="num absent">${s.absent}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<div class="none-row">Every student was present at every checkpoint in this period.</div>`;

  const pct = totalMarks ? (100 - (100 * exceptions.length) / totalMarks).toFixed(1) : "—";

  return page(
    `${header(
      "Attendance summary",
      `${fmtDay(from)} to ${fmtDay(to)} · ${totalMarks} marks · ${pct}% present`
    )}

<h2>By day</h2>
<table>
  <thead><tr>
    <th style="width:26%">Day</th>
    <th style="width:34%">Taken by</th>
    <th class="num" style="width:20%">Absent</th>
    <th class="num" style="width:20%">Elsewhere</th>
  </tr></thead>
  <tbody>${perDay}</tbody>
</table>

<h2>Students with exceptions (${students.length})</h2>
${grid}
<div class="legend">
  A number is how many checkpoints that student missed that day; <b>P</b> means present
  at all of them. ${absent} absences and ${exceptions.length - absent} accounted-for
  absences in this period.
</div>

<h2>Every exception</h2>
${exceptionsTable(exceptions, { showDay: true })}
${footer(generatedBy)}`
  );
}

/**
 * The coordinator's sheet.
 *
 * A class teacher reads a register — thirty names and their marks. A
 * coordinator reads a headcount: ten checkpoints, seven hundred children, and
 * the only two questions that fit on a page. Did the numbers add up? If not,
 * who, and why?
 *
 * So there is no student grid here. Counts per checkpoint, then every mark
 * that was not "present", named and with its reason spelled out in the
 * school's own wording rather than a letter. On a normal day that is one page
 * where the register would have been fifteen.
 *
 * `strength` is how many children the checkpoint actually covers, not the size
 * of the school — a residential-only checkpoint excludes day scholars, and a
 * sheet that ignored that would report a shortfall every single evening.
 */
export function headcountReportHtml(
  { from, to, days, checkpoints, exceptions, totals, byReason },
  { generatedBy } = {}
) {
  // Over a range the checkpoint numbers would restart every day and key back
  // to nothing, so the day itself becomes the first column instead.
  const multiDay = days.length > 1;

  const rows = checkpoints
    .map(
      (c, i) => `<tr>
        ${multiDay ? `<td>${esc(fmtDay(c.day))}</td>` : `<td class="c"><b>${i + 1}</b></td>`}
        <td>${esc(clip(c.name, 24))}</td>
        <td>${esc(fmtTime(c.startMin))}</td>
        <td>${esc(clip(c.group, 24))}</td>
        <td class="num">${c.strength}</td>
        <td class="num">${c.present}</td>
        <td class="num${c.absent ? " absent" : ""}">${c.absent}</td>
        <td class="num">${c.elsewhere}</td>
      </tr>`
    )
    .join("");

  const reasonRows = byReason
    .map(
      (r) => `<tr>
        <td class="${r.status === "A" ? "absent" : "other"}">${esc(r.label)}</td>
        <td class="num">${r.marks}</td>
      </tr>`
    )
    .join("");

  const counted = `${totals.present} of ${totals.strength} present`;

  return page(
    `${header(
      "Attendance headcount",
      `${multiDay ? `${fmtDay(from)} to ${fmtDay(to)}` : fmtDay(from)} · ${
        checkpoints.length
      } checkpoints · ${counted}`
    )}

<h2>Headcount</h2>
${
  checkpoints.length
    ? `<table>
  <thead><tr>
    <th${multiDay ? ' style="width:16%"' : ' class="c" style="width:8mm"'}>${multiDay ? "Day" : "#"}</th>
    <th style="width:${multiDay ? 22 : 28}%">Checkpoint</th>
    <th style="width:12%">Time</th>
    <th style="width:${multiDay ? 18 : 22}%">Group</th>
    <th class="num" style="width:10%">Strength</th>
    <th class="num" style="width:10%">Present</th>
    <th class="num" style="width:9%">Absent</th>
    <th class="num" style="width:9%">Other</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="4">Total</td>
    <td class="num">${totals.strength}</td>
    <td class="num">${totals.present}</td>
    <td class="num${totals.absent ? " absent" : ""}">${totals.absent}</td>
    <td class="num">${totals.elsewhere}</td>
  </tr></tfoot>
</table>`
    : `<div class="none-row">No checkpoint was submitted in this period.</div>`
}

<h2>By reason</h2>
${
  byReason.length
    ? `<table>
  <thead><tr>
    <th style="width:70%">Reason</th>
    <th class="num" style="width:30%">Marks</th>
  </tr></thead>
  <tbody>${reasonRows}</tbody>
</table>`
    : `<div class="none-row">Every child was present at every checkpoint.</div>`
}

<h2>Not present (${exceptions.length})</h2>
${exceptionsTable(exceptions, { showDay: multiDay })}
${footer(generatedBy)}`
  );
}

/**
 * The Saturday morning assembly sheet.
 *
 * Unlike everything above it, this is not a report the app invented — it is a
 * page the school already has, ruled into a spiral book, filled in by hand
 * every Saturday and signed by three people. So the layout is copied, not
 * designed: the same twelve rows in the same order, the same column headings
 * in the same words, the same Play School line underneath and the same three
 * signature blocks at the foot. Somebody who has signed the paper one for
 * years should be able to sign this without reading it twice.
 *
 * Two things are deliberately NOT copied.
 *
 * The blank columns stay blank. "House Teacher" and "Signature" are ruled and
 * empty because they are written in at the assembly, and so is the whole Play
 * School line — the play school is not in this app's register, and printing a
 * number there would be inventing one.
 *
 * Nothing is silently rounded into a column that does not fit it. Children
 * marked Activity or Self study are on campus and counted present, with the
 * number stated in a note; on paper they go in the Res A column with "on
 * duty" pencilled above, which works when a human reads it and is a lie when
 * a computer adds it up. Children with no mark at all are called out the same
 * way rather than being quietly counted as present — that gap is the single
 * thing the sheet exists to catch.
 */
export function saturdayReportHtml(
  { day, rows, totals, checkpoint, duties, submitted },
  { generatedBy } = {}
) {
  // A dash, exactly as the paper form is filled in. A grid of noughts is
  // harder to read across than a grid with gaps in it.
  const n = (v) => (v ? String(v) : "—");

  const rowHtml = (r) => {
    const label = r.house ? `${r.band} ${r.house}` : `${r.band} — no house set`;
    return `<tr class="${r.house ? "" : "unassigned"}">
      <td class="row-label">${esc(label)}</td>
      <td>${n(r.res)}</td>
      <td>${n(r.day)}</td>
      <td>${n(r.strength)}</td>
      <td>${n(r.resPresent)}</td>
      <td>${n(r.dayPresent)}</td>
      <td>${n(r.resAbsent)}</td>
      <td>${n(r.dayAbsent)}</td>
      <td>${n(r.sick)}</td>
      <td>${n(r.notReported)}</td>
      <td></td>
      <td></td>
    </tr>`;
  };

  // Written out rather than left for the reader to notice, because a sheet
  // that does not add up is the only interesting thing on the page.
  const notes = [];
  if (duties === 0) {
    notes.push(
      `<div class="note warn">No morning checkpoint was rostered on this day. The strengths
       above are from the register; every count column is empty.</div>`
    );
  } else if (submitted < duties) {
    notes.push(
      `<div class="note warn">${duties - submitted} of ${plural(duties, "checkpoint")}
       for ${esc(checkpoint)} had not been submitted when this sheet was printed.</div>`
    );
  }
  // Not when nothing was rostered: the note above already says why the count
  // columns are empty, and repeating it as "409 students have no mark" reads
  // like a second, worse problem.
  if (totals.unmarked && duties > 0) {
    const one = totals.unmarked === 1;
    notes.push(
      `<div class="note warn">${plural(totals.unmarked, "student")} in the register
       ${one ? "has" : "have"} no mark at this checkpoint and ${one ? "is" : "are"} not
       counted in any column above, so the rows do not add up to Total.</div>`
    );
  }
  if (totals.onDuty) {
    notes.push(
      `<div class="note">${totals.onDuty} of the students counted present
       ${totals.onDuty === 1 ? "was" : "were"} marked Activity or Self study — on duty
       elsewhere on campus, not at the assembly.</div>`
    );
  }

  return page(
    `<div class="form-title">BHAKTIVEDANTA GURUKULA AND INTERNATIONAL SCHOOL</div>
<div class="form-sub">Saturday Morning Attendance Report Grade 2-12</div>

<div class="form-meta">
  <span>Date :- <b>${esc(fmtDayNumeric(day))}</b></span>
  <span>Day :- <b>${esc(weekdayOf(day))}</b></span>
</div>

<table class="form">
  <thead><tr>
    <th style="width:36mm">Class</th>
    <th style="width:10mm">Res</th>
    <th style="width:10mm">Day</th>
    <th style="width:10mm">Total</th>
    <th style="width:10mm">Res P</th>
    <th style="width:10mm">Day P</th>
    <th style="width:10mm">Res A</th>
    <th style="width:10mm">Day A</th>
    <th style="width:10mm">Sick</th>
    <th style="width:20mm">Not Reported (Home) / GN</th>
    <!-- Every column is given a width, including the two blank ones, and they
         add up to the 186mm of A4 content area exactly. A fixed table layout
         hands leftover space to whatever has no width — which is nothing when
         the page is A4, and is zero-width columns the moment it is rendered
         anywhere narrower. The two columns that would vanish are the two that
         have to be written in. -->
    <th style="width:25mm">House Teacher</th>
    <th style="width:25mm">Signature</th>
  </tr></thead>
  <tbody>
    ${rows.map(rowHtml).join("")}
    <tr class="total">
      <td class="row-label">Total</td>
      <td>${n(totals.res)}</td>
      <td>${n(totals.day)}</td>
      <td>${n(totals.strength)}</td>
      <td>${n(totals.resPresent)}</td>
      <td>${n(totals.dayPresent)}</td>
      <td>${n(totals.resAbsent)}</td>
      <td>${n(totals.dayAbsent)}</td>
      <td>${n(totals.sick)}</td>
      <td>${n(totals.notReported)}</td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>

<!-- Ruled and empty on purpose: the play school is not in this register, so
     this line is filled in by hand exactly as it is on the paper form. -->
<table class="play">
  <tr>
    <td style="width:36mm">Play School</td>
    <td style="width:20mm">Total</td>
    <td style="width:16mm"></td>
    <td style="width:24mm">Present</td>
    <td style="width:16mm"></td>
    <td style="width:22mm">Absent</td>
    <td style="width:16mm"></td>
    <td style="width:20mm">Signature</td>
    <td style="width:16mm"></td>
  </tr>
</table>

${notes.join("")}

<div class="signatures">
  <div>Assembly Co-ordinator</div>
  <div>MOD</div>
  <div>Principal</div>
</div>

${footer(generatedBy)}`
  );
}
