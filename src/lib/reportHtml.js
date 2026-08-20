import { fmtTime, fmtDay } from "../utils/format";

/**
 * The printed attendance sheet.
 *
 * A pure function from data to an HTML string — no React, no side effects —
 * so the layout can be reasoned about and checked without a device.
 *
 * THE CONSTRAINT: five A4 pages for 700 students, one or two for 100. That
 * rules out a card per child and rules out one row per child in a single
 * column (700 rows is nine pages before anything else is on them). What fits
 * is a multi-column grid, and the column count and type size have to adapt to
 * the roster rather than being fixed — a 100-student sheet set at 700-student
 * density is unreadable for no reason.
 *
 * Working from A4 at 9mm margins (192 × 279mm usable):
 *
 *   students  type    columns   rows/page   students/page
 *   ≤150      8pt     3–4       ~73         ~250
 *   ≤400      7pt     3         ~82         ~245
 *   >400      6.5pt   2–3       ~87         ~260
 *
 * 700 students with eight checkpoints lands at three columns of 6.5pt: about
 * 2.7 pages of grid, plus one for the summary and exceptions.
 *
 * Present is printed as a middle dot, not a tick. Almost every cell is
 * present, and 5,600 ticks is a page of noise that hides the twelve marks
 * anyone is actually looking for.
 */

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Long names cost width in every one of N columns, so they are clipped. */
const clip = (s, n) => {
  const t = String(s ?? "");
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};

/** One character per mark. Blank means the checkpoint did not cover them. */
const cell = (mark) => {
  if (!mark) return "";
  if (mark.present) return "·";
  return esc(mark.status);
};

/**
 * Type size and column count, chosen from the roster and how many checkpoints
 * each block has to carry.
 */
function density(studentCount, checkpointCount) {
  const font = studentCount > 400 ? 6.5 : studentCount > 150 ? 7 : 8;

  // Derived from the type size rather than fixed: a flat 4mm-per-checkpoint
  // estimate dropped a ten-checkpoint day to two columns and six pages, when
  // at 6.5pt a single character needs barely three. 1pt = 0.3528mm; 0.55 is
  // about the average glyph advance for this face, 1.4 leaves a centred
  // character room to breathe.
  const charMm = font * 0.3528 * 0.55;
  const cellMm = Math.max(3, font * 0.3528 * 1.4);
  const ROLL_MM = 5;
  const GAP_MM = 4;
  const USABLE_MM = 192; // A4 width less 9mm margins
  const MIN_NAME_CHARS = 12; // below this, names stop being recognisable

  // Most columns that still leave a readable name. Fewer, wider columns are
  // easy to read and run to too many pages; this takes the tightest layout
  // that has not crossed into unreadable.
  let columns = 2;
  let nameMm = MIN_NAME_CHARS * charMm;
  for (let n = 4; n >= 2; n -= 1) {
    const block = (USABLE_MM - GAP_MM * (n - 1)) / n;
    const avail = block - ROLL_MM - checkpointCount * cellMm;
    if (avail >= MIN_NAME_CHARS * charMm || n === 2) {
      columns = n;
      nameMm = Math.max(avail, MIN_NAME_CHARS * charMm);
      break;
    }
  }

  return {
    font,
    columns,
    nameChars: Math.max(MIN_NAME_CHARS, Math.floor(nameMm / charMm)),
    cellMm: Math.round(cellMm * 10) / 10,
  };
}

const SHEET_CSS = (font) => `
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: ${font}pt;
    line-height: 1.2;
    color: #111;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: ${font + 5}pt; margin: 0 0 1mm; }
  h2 {
    font-size: ${font + 1}pt;
    margin: 4mm 0 1.5mm;
    padding-bottom: 0.8mm;
    border-bottom: 0.4mm solid #111;
    /* A heading stranded at the foot of a page is worse than an early break. */
    page-break-after: avoid;
  }
  .sub { color: #555; margin: 0 0 3mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th {
    font-size: ${font - 0.5}pt;
    text-align: left;
    border-bottom: 0.3mm solid #111;
    padding: 0.6mm 0.8mm;
    white-space: nowrap;
  }
  td { padding: 0.5mm 0.8mm; overflow: hidden; white-space: nowrap; }
  tbody tr { page-break-inside: avoid; }
  /* Zebra rather than a rule under every row: at this density a line per row
     turns the grid into a screen of hatching. */
  tbody tr:nth-child(even) td { background: #f2f2f2; }
  .num { text-align: right; color: #555; }
  .c { text-align: center; }
  .dim { color: #999; }
  .absent { font-weight: 700; color: #fff; background: #000; }
  .other { font-weight: 700; }
  .sep { border-left: 0.3mm solid #ccc; }
  .summary td, .summary th { padding: 1mm 1.5mm; }
  .summary { margin-bottom: 2mm; }
  .legend { margin-top: 2.5mm; color: #555; font-size: ${font - 0.5}pt; }
  .foot { margin-top: 4mm; padding-top: 1.5mm; border-top: 0.3mm solid #ccc; color: #777; font-size: ${font - 1}pt; }
  .none { color: #555; padding: 2mm 0; }
`;

const header = (title, sub) =>
  `<h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div>`;

const footer = (by) =>
  `<div class="foot">Generated ${esc(
    new Date().toLocaleString()
  )}${by ? ` by ${esc(by)}` : ""} · Bhaktivedanta Gurukula &amp; International School</div>`;

/** Marks that are not "present", listed in full — the actionable part. */
function exceptionsTable(rows, { showDay = false } = {}) {
  if (!rows.length) {
    return `<div class="none">Every student was present at every checkpoint.</div>`;
  }
  const head = `
    <tr>
      ${showDay ? "<th style='width:16%'>Day</th>" : ""}
      <th style="width:8%">Roll</th>
      <th style="width:${showDay ? 30 : 38}%">Student</th>
      <th style="width:10%">Class</th>
      <th style="width:${showDay ? 22 : 28}%">Checkpoint</th>
      <th style="width:16%">Status</th>
    </tr>`;

  const body = rows
    .map(
      (r) => `
    <tr>
      ${showDay ? `<td>${esc(fmtDay(r.day))}</td>` : ""}
      <td class="num">${esc(r.roll_no ?? "")}</td>
      <td>${esc(r.student)}</td>
      <td>${esc(r.grade)} ${esc(r.section)}</td>
      <td>${esc(r.checkpoint)}</td>
      <td class="${r.status === "A" ? "other" : ""}">${esc(r.status_label)}</td>
    </tr>`
    )
    .join("");

  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/**
 * The full student × checkpoint grid, laid out in `columns` side-by-side
 * blocks. One flat table with fixed widths rather than CSS multi-column: a
 * table breaks across pages predictably and repeats its header, which
 * `column-count` does not do reliably in print.
 */
function rosterGrid(students, checkpoints, { columns, nameChars, cellMm }) {
  const per = Math.ceil(students.length / columns);
  // Down each column, then across — so a column reads as a continuous run of
  // roll numbers instead of every fourth child.
  const blocks = Array.from({ length: columns }, (_, i) =>
    students.slice(i * per, (i + 1) * per)
  );

  const colHead = (first) => `
    <th class="num ${first ? "" : "sep"}" style="width:6mm">#</th>
    <th>Student</th>
    ${checkpoints
      .map(
        (c) =>
          `<th class="c" style="width:${cellMm}mm" title="${esc(c.name)}">${esc(
            initials(c.name)
          )}</th>`
      )
      .join("")}`;

  const head = `<tr>${blocks.map((_, i) => colHead(i === 0)).join("")}</tr>`;

  const rows = Array.from({ length: per }, (_, row) => {
    const tds = blocks
      .map((block, i) => {
        const s = block[row];
        if (!s) {
          return `<td class="${i === 0 ? "" : "sep"}"></td><td></td>${checkpoints
            .map(() => "<td></td>")
            .join("")}`;
        }
        const marks = checkpoints
          .map((c) => {
            const m = s.marks[c.dutyId];
            const text = cell(m);
            const cls = !m
              ? "dim"
              : m.present
                ? "dim"
                : m.status === "A"
                  ? "absent"
                  : "other";
            return `<td class="c ${cls}">${text}</td>`;
          })
          .join("");
        return `<td class="num ${i === 0 ? "" : "sep"}">${esc(s.roll ?? "")}</td><td>${esc(
          clip(s.name, nameChars)
        )}</td>${marks}`;
      })
      .join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

/** "Breakfast prasadam" -> "BP". Column headings are 4mm wide. */
function initials(name) {
  const words = String(name || "").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** One day: summary, exceptions, then the full grid. */
export function dayReportHtml({ day, checkpoints, students }, { generatedBy } = {}) {
  const d = density(students.length, checkpoints.length);

  const exceptions = [];
  students.forEach((s) => {
    checkpoints.forEach((c) => {
      const m = s.marks[c.dutyId];
      if (m && !m.present) {
        exceptions.push({
          roll_no: s.roll,
          student: s.name,
          grade: s.grade,
          section: s.section,
          checkpoint: c.name,
          status: m.status,
          status_label: m.label,
        });
      }
    });
  });

  const summaryRows = checkpoints
    .map((c) => {
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
        <td><b>${esc(initials(c.name))}</b> ${esc(c.name)}</td>
        <td>${esc(fmtTime(c.startMin))}</td>
        <td>${esc(clip(c.group, 28))}</td>
        <td class="num">${marked}</td>
        <td class="num">${marked - absent - elsewhere}</td>
        <td class="num">${absent}</td>
        <td class="num">${elsewhere}</td>
      </tr>`;
    })
    .join("");

  return `<style>${SHEET_CSS(d.font)}</style>
${header("Attendance", `${fmtDay(day)} · ${students.length} students · ${checkpoints.length} checkpoints`)}

<h2>Checkpoints</h2>
<table class="summary">
  <thead><tr>
    <th style="width:30%">Checkpoint</th><th style="width:12%">Time</th>
    <th style="width:26%">Group</th><th class="num" style="width:8%">Marked</th>
    <th class="num" style="width:8%">Present</th><th class="num" style="width:8%">Absent</th>
    <th class="num" style="width:8%">Elsewhere</th>
  </tr></thead>
  <tbody>${summaryRows}</tbody>
</table>

<h2>Not present (${exceptions.length})</h2>
${exceptionsTable(exceptions)}

<h2>Full register</h2>
${rosterGrid(students, checkpoints, d)}
<div class="legend">
  · present &nbsp;·&nbsp; <span class="absent">A</span> absent &nbsp;·&nbsp;
  H home, S sick, O outing, G Gita Nagari, V activity, Y self study &nbsp;·&nbsp;
  blank = not in that checkpoint's group
</div>
${footer(generatedBy)}`;
}

/**
 * A date range. Only students with something to report are listed: a week of
 * 700 all-present children is forty thousand dots and nothing to act on.
 */
export function rangeReportHtml({ from, to, days, exceptions, totalMarks, students }, { generatedBy } = {}) {
  const d = density(students.length, days.length);
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
          <th class="num" style="width:6mm">#</th>
          <th style="width:34%">Student</th>
          <th style="width:8%">Class</th>
          ${days.map((day) => `<th class="c">${esc(fmtDay(day).slice(0, 3))}</th>`).join("")}
          <th class="num" style="width:8%">Abs</th>
        </tr></thead>
        <tbody>${students
          .map(
            (s) => `<tr>
              <td class="num">${esc(s.roll ?? "")}</td>
              <td>${esc(clip(s.name, 30))}</td>
              <td>${esc(s.classLabel)}</td>
              ${days
                .map((day) =>
                  s.days[day]
                    ? `<td class="c other">${s.days[day]}</td>`
                    : `<td class="c dim">·</td>`
                )
                .join("")}
              <td class="num"><b>${s.absent}</b></td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<div class="none">Every student was present at every checkpoint in this period.</div>`;

  const pct = totalMarks
    ? (100 - (100 * exceptions.length) / totalMarks).toFixed(1)
    : "—";

  return `<style>${SHEET_CSS(d.font)}</style>
${header(
  "Attendance summary",
  `${fmtDay(from)} to ${fmtDay(to)} · ${totalMarks} marks · ${pct}% present`
)}

<h2>By day</h2>
<table class="summary">
  <thead><tr><th style="width:50%">Day</th><th class="num">Absent</th><th class="num">Elsewhere</th></tr></thead>
  <tbody>${perDay}</tbody>
</table>

<h2>Students with exceptions (${students.length})</h2>
${grid}
<div class="legend">
  A number is how many checkpoints that student missed that day; · means present at all of them.
  &nbsp;·&nbsp; ${absent} absences and ${exceptions.length - absent} accounted-for
  absences in this period.
</div>

<h2>Every exception</h2>
${exceptionsTable(exceptions, { showDay: true })}
${footer(generatedBy)}`;
}
