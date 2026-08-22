import { fmtTime, fmtDay } from "../utils/format";

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
        <td>${esc(clip(s.name))}</td>
        <td>${esc(s.classLabel)}</td>
        ${cells}
      </tr>`;
    })
    .join("");

  return `<table>
    <thead><tr>
      <th class="num" style="width:12mm">Roll</th>
      <th>Student</th>
      <th style="width:16mm">Class</th>
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
export function dayReportHtml({ day, checkpoints, students }, { generatedBy } = {}) {
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
      return `<tr>
        <td class="c"><b>${i + 1}</b></td>
        <td>${esc(c.name)}</td>
        <td>${esc(fmtTime(c.startMin))}</td>
        <td>${esc(clip(c.group, 26))}</td>
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
      `${fmtDay(day)} · ${students.length} students · ${checkpoints.length} checkpoints`
    )}

<h2>Checkpoints</h2>
<table>
  <thead><tr>
    <th class="c" style="width:8mm">#</th>
    <th style="width:28%">Checkpoint</th>
    <th style="width:14%">Time</th>
    <th style="width:22%">Group</th>
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
  { from, to, days, exceptions, totalMarks, students },
  { generatedBy } = {}
) {
  const absent = exceptions.filter((e) => e.status === "A").length;

  const perDay = days
    .map((day) => {
      const rows = exceptions.filter((e) => e.day === day);
      return `<tr>
        <td>${esc(fmtDay(day))}</td>
        <td class="num">${rows.filter((r) => r.status === "A").length}</td>
        <td class="num">${rows.filter((r) => r.status !== "A").length}</td>
      </tr>`;
    })
    .join("");

  const grid = students.length
    ? `<table>
        <thead><tr>
          <th class="num" style="width:12mm">Roll</th>
          <th>Student</th>
          <th style="width:16mm">Class</th>
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
    <th style="width:50%">Day</th>
    <th class="num" style="width:25%">Absent</th>
    <th class="num" style="width:25%">Elsewhere</th>
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
