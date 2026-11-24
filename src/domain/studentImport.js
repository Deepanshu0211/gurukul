/**
 * Bulk student import: what a spreadsheet row has to say before it may be
 * sent to the register, and how to explain to a teacher what is wrong with it.
 *
 * Pure functions. No React, no Supabase. The database (`add_students`,
 * migration 052) applies the same rules again and is the real boundary; this
 * file exists so a teacher sees every problem in the file BEFORE anything is
 * written, row by row, in words they can act on — rather than discovering
 * them one failure at a time.
 *
 * The template's columns are the school's own register headings ("Admission
 * No", "Student Name", …), so a sheet exported from the office's Excel
 * register imports without renaming anything.
 */

import { HOUSE_ORDER } from "./houses";

export const STUDENT_TYPE_VALUES = ["Residential", "Day Scholar", "Day Boarding", "Vedic School"];

/**
 * The template, in column order. `aliases` are other headings the same column
 * turns up under in real files; matching ignores case, spaces and punctuation.
 */
export const IMPORT_COLUMNS = [
  {
    key: "admissionNo",
    header: "Admission No",
    aliases: ["admissionno", "admissionnumber", "admno", "admnno", "admission", "admissionid", "srno", "scholarno"],
    width: 16,
    help: "Required. The number on the admission form, 3–20 letters or digits. Never reuse a number.",
  },
  {
    key: "name",
    header: "Student Name",
    aliases: ["studentname", "name", "fullname", "student", "nameofstudent", "studentsname"],
    width: 28,
    help: "Required. Full name as on the admission form.",
  },
  {
    key: "grade",
    header: "Grade",
    aliases: ["grade", "class", "std", "standard", "classgrade"],
    width: 8,
    help: "1 to 12. A teacher may leave Grade and Section blank to add to their own class.",
  },
  {
    key: "section",
    header: "Section",
    aliases: ["section", "sec", "division", "div", "classsection"],
    width: 12,
    help: "The section as the register writes it, e.g. A or KRISHNA.",
  },
  {
    key: "stype",
    header: "Student Type",
    aliases: ["studenttype", "type", "stype", "category", "boarding", "residentialstatus", "dayscholarresidential"],
    width: 16,
    help: "Required. Residential, Day Scholar, Day Boarding or Vedic School.",
  },
  {
    key: "house",
    header: "House",
    aliases: ["house", "housename"],
    width: 14,
    help: "Optional. One of the school's houses.",
  },
  {
    key: "roll",
    header: "Roll No",
    aliases: ["rollno", "roll", "rollnumber", "rno"],
    width: 9,
    help: "Optional. Leave blank to take the next free roll number in the class.",
  },
];

export const FIELD_LABEL = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.header]));

/** More than this in one file is a whole school, which is a database job. */
export const MAX_IMPORT_ROWS = 2000;

const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const ALIAS = new Map();
IMPORT_COLUMNS.forEach((c) => c.aliases.forEach((a) => ALIAS.set(a, c.key)));

/** Which column each field is in, read from one header row. */
function mapHeaderRow(cells) {
  const columns = {};
  cells.forEach((cell, i) => {
    const key = ALIAS.get(squash(cell));
    if (key && columns[key] == null) columns[key] = i;
  });
  return columns;
}

/**
 * Sheet rows → draft rows, one per student.
 *
 * The header is looked for in the first ten rows rather than assumed to be
 * row 1: the office's register has a title line or two above it, and making
 * a teacher delete those first is the kind of friction that ends with the
 * file never being uploaded.
 *
 * @returns {{ drafts?: object[], problem?: string, ignored?: string[] }}
 *   `line` on each draft is the row number as the teacher sees it in Excel.
 */
export function draftsFromSheet(rows) {
  let headerAt = -1;
  let columns = null;
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const found = mapHeaderRow(rows[i] || []);
    if (found.admissionNo != null && found.name != null) {
      headerAt = i;
      columns = found;
      break;
    }
  }
  if (headerAt < 0) {
    return {
      problem:
        "This file does not have the template's column headings. The first row needs at least " +
        "“Admission No” and “Student Name”. Download the template and copy your students into it.",
    };
  }

  const known = new Set(Object.values(columns));
  const ignored = (rows[headerAt] || [])
    .map((h, i) => (!known.has(i) && clean(h) ? clean(h) : null))
    .filter(Boolean);

  const drafts = [];
  for (let i = headerAt + 1; i < rows.length; i += 1) {
    const cells = rows[i] || [];
    const values = {};
    IMPORT_COLUMNS.forEach((c) => {
      values[c.key] = columns[c.key] != null ? clean(cells[columns[c.key]]) : "";
    });
    // A row with nothing in any template column is spacing, not a student.
    if (IMPORT_COLUMNS.every((c) => !values[c.key])) continue;
    drafts.push({ id: `r${i + 1}`, line: i + 1, values });
  }

  if (drafts.length === 0) {
    return { problem: "The file has the right headings but no students under them." };
  }
  if (drafts.length > MAX_IMPORT_ROWS) {
    return {
      problem:
        `This file has ${drafts.length} students. Import at most ${MAX_IMPORT_ROWS} at a time — ` +
        "split it into smaller files, for example one per grade.",
    };
  }
  return { drafts, ignored };
}

// ── Reading each value ──────────────────────────────────────────────────────

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** "4", "04", "Grade 4", "Class IV", "4.0" → 4. Also splits "4A" / "6 Krishna"
 *  into grade and section when the section column is empty. */
function readGrade(raw) {
  const s = clean(raw).replace(/^(grade|class|std\.?|standard)\s*/i, "");
  if (!s) return { grade: null };
  const num = /^0*(\d{1,2})(?:\.0+)?$/.exec(s);
  if (num) return { grade: Number(num[1]) };
  if (ROMAN[s.toLowerCase()]) return { grade: ROMAN[s.toLowerCase()] };
  const split = /^0*(\d{1,2})\s*[-/ ]?\s*([A-Za-z][A-Za-z ]*)$/.exec(s);
  if (split) return { grade: Number(split[1]), section: split[2].trim() };
  return { grade: NaN };
}

const TYPE_ALIASES = {
  residential: "Residential",
  resident: "Residential",
  res: "Residential",
  r: "Residential",
  boarder: "Residential",
  hostel: "Residential",
  hosteller: "Residential",
  dayscholar: "Day Scholar",
  dayscholars: "Day Scholar",
  day: "Day Scholar",
  ds: "Day Scholar",
  d: "Day Scholar",
  dayboarding: "Day Boarding",
  dayboarder: "Day Boarding",
  db: "Day Boarding",
  b: "Day Boarding",
  vedicschool: "Vedic School",
  vedic: "Vedic School",
  v: "Vedic School",
};

/** Admission numbers as Excel hands them over: "202102150", "202102150.0". */
const readAdmission = (raw) => clean(raw).replace(/\.0+$/, "").replace(/\s+/g, "").toUpperCase();

const readRoll = (raw) => {
  const s = clean(raw).replace(/\.0+$/, "");
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

const SECTION_LABEL = { KRISHNA: "Krishna", BALRAM: "Balram", VEDIC: "Vedic" };
const prettySection = (sec) =>
  SECTION_LABEL[sec.toUpperCase()] || (sec.length <= 2 ? sec.toUpperCase() : sec[0].toUpperCase() + sec.slice(1).toLowerCase());

// ── Context ─────────────────────────────────────────────────────────────────

/**
 * Everything validation needs to know about the school, built once per file.
 *
 * @param students      the active register, app-shaped (lib/students.fromRow)
 * @param known         admission numbers found in the database for this file,
 *                      INCLUDING students who have left: Map(ADM → {name, active, label})
 * @param mayStartClass whether this person may start a new class (domain/roles)
 * @param ownClassKey   their own class ("4|A"), used when a row leaves Grade and Section blank
 */
export function importContext({ students = [], known = new Map(), houses = [], mayStartClass = false, ownClassKey = null }) {
  const byAdm = new Map();
  const classes = new Map();
  const rolls = new Map();
  for (const s of students) {
    byAdm.set(String(s.adm).toUpperCase(), { name: s.name, label: s.label, active: true });
    const ck = `${s.grade}|${String(s.sec).toUpperCase()}`;
    if (!classes.has(ck)) classes.set(ck, { key: s.key, grade: s.grade, sec: s.sec, label: s.label });
    if (s.roll) {
      if (!rolls.has(s.key)) rolls.set(s.key, new Map());
      rolls.get(s.key).set(Number(s.roll), s.name);
    }
  }
  for (const [adm, info] of known) if (!byAdm.has(adm)) byAdm.set(adm, info);

  const houseNames = [...new Set([...HOUSE_ORDER, ...houses])];
  const houseMap = new Map(houseNames.map((h) => [h.toLowerCase(), h]));

  const own = [...classes.values()].find((c) => c.key === ownClassKey) || null;
  return { byAdm, classes, rolls, houseMap, houseNames, mayStartClass, ownClass: own };
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Check every draft against the register and against each other.
 *
 * Each result carries `errors` (field → sentence; any error keeps the row out
 * of the import), `warnings` (sentences; the row still goes in) and `clean`,
 * the values exactly as they will be sent.
 *
 * Whole-file checks — the same admission number twice, two children given
 * the same roll number in one class — need every row, which is why this takes
 * the list rather than one row at a time. It is a few Map lookups per row, so
 * revalidating two thousand rows after one edit is still instant.
 */
export function validateDrafts(drafts, ctx) {
  const firstPass = drafts.map((d) => checkRow(d, ctx));

  const admLines = new Map();
  const rollLines = new Map();
  for (const r of firstPass) {
    const adm = r.clean.admissionNo;
    if (adm) admLines.set(adm, [...(admLines.get(adm) || []), r.line]);
    if (r.classKey && r.clean.roll) {
      const k = `${r.classKey}#${r.clean.roll}`;
      rollLines.set(k, [...(rollLines.get(k) || []), r.line]);
    }
  }

  return firstPass.map((r) => {
    const errors = { ...r.errors };
    const warnings = [...r.warnings];
    const lines = admLines.get(r.clean.admissionNo);
    if (lines && lines.length > 1 && !errors.admissionNo) {
      errors.admissionNo = `Appears ${lines.length} times in this file (rows ${lines.join(", ")}). Each student needs their own number.`;
    }
    // A warning, not an error: the school's own register has two children on
    // roll 218 in Class 2 A, and the database allows it. Refusing it here
    // would refuse the real register.
    if (r.classKey && r.clean.roll && !errors.roll) {
      const same = rollLines.get(`${r.classKey}#${r.clean.roll}`);
      if (same && same.length > 1) {
        warnings.push(`Roll ${r.clean.roll} is given to ${same.length} students in Class ${r.classLabel} (rows ${same.join(", ")}).`);
      }
    }
    if (r.serverError && !errors.server) errors.server = r.serverError;
    return { ...r, errors, warnings, ok: Object.keys(errors).length === 0 };
  });
}

function checkRow(draft, ctx) {
  const v = draft.values;
  const errors = {};
  const warnings = [];

  // Admission number
  const admissionNo = readAdmission(v.admissionNo);
  if (!admissionNo) errors.admissionNo = "Admission number is missing.";
  else if (!/^[A-Z0-9/-]{3,20}$/.test(admissionNo)) {
    errors.admissionNo = "Use 3–20 letters, digits, / or - — as on the admission form.";
  } else {
    const taken = ctx.byAdm.get(admissionNo);
    if (taken?.active) {
      errors.admissionNo = `Already on the register: ${taken.name}${taken.label ? `, Class ${taken.label}` : ""}.`;
    } else if (taken) {
      errors.admissionNo = `Belonged to ${taken.name || "a student"} who has left. Admission numbers are never reused.`;
    }
  }

  // Name
  const name = clean(v.name);
  if (!name) errors.name = "Name is missing.";
  else if (name.length < 2) errors.name = "Write the student's full name.";
  else if (name.length > 80) errors.name = "Name is longer than 80 characters.";

  // Class
  let { grade, section } = readGrade(v.grade);
  section = clean(v.section) || section || "";
  let ownClass = false;
  if (grade == null && !section && ctx.ownClass) {
    grade = ctx.ownClass.grade;
    section = ctx.ownClass.sec;
    ownClass = true;
  }
  let classKey = null;
  let classLabel = null;
  let newClass = false;
  if (grade == null) errors.grade = "Grade is missing.";
  else if (!(grade >= 1 && grade <= 12)) errors.grade = "Grade must be a number from 1 to 12.";
  if (!section) errors.section = "Section is missing.";
  else if (!/^[A-Za-z0-9 -]{1,20}$/.test(section)) errors.section = "Section: letters or digits only, e.g. A or KRISHNA.";

  if (!errors.grade && !errors.section) {
    const existing = ctx.classes.get(`${grade}|${section.toUpperCase()}`);
    if (existing) {
      classKey = existing.key;
      classLabel = existing.label;
      section = existing.sec;
    } else {
      section = section.toUpperCase();
      classKey = `${grade}|${section}`;
      classLabel = `${grade} ${prettySection(section)}`;
      newClass = true;
      if (ctx.mayStartClass) {
        warnings.push(`Starts a new class, ${classLabel}. Check the section is spelt as the school writes it.`);
      } else {
        errors.section = `Class ${classLabel} has no students yet. Only a coordinator can start a new class — check the grade and section.`;
      }
    }
  }

  // Student type
  let stype = null;
  if (!clean(v.stype)) errors.stype = "Student type is missing: Residential, Day Scholar, Day Boarding or Vedic School.";
  else {
    stype = TYPE_ALIASES[squash(v.stype)] || null;
    if (!stype) errors.stype = `“${clean(v.stype)}” is not a student type. Use Residential, Day Scholar, Day Boarding or Vedic School.`;
  }

  // House
  let house = null;
  if (clean(v.house)) {
    house = ctx.houseMap.get(clean(v.house).toLowerCase()) || null;
    if (!house) errors.house = `No house called “${clean(v.house)}”. Use ${ctx.houseNames.join(", ")}, or leave it blank.`;
  }

  // Roll number
  const roll = readRoll(v.roll);
  if (Number.isNaN(roll) || (roll != null && (roll < 1 || roll > 9999))) {
    errors.roll = "Roll number must be a whole number from 1 to 9999, or blank.";
  } else if (roll != null && classKey && ctx.rolls.get(classKey)?.has(roll)) {
    warnings.push(`Roll ${roll} already belongs to ${ctx.rolls.get(classKey).get(roll)} in Class ${classLabel}.`);
  }

  return {
    ...draft,
    clean: {
      admissionNo,
      name,
      grade: errors.grade ? null : grade,
      section: errors.section ? null : section,
      stype,
      house,
      roll: Number.isNaN(roll) ? null : roll,
    },
    classKey,
    classLabel,
    newClass,
    ownClass,
    errors,
    warnings,
  };
}

/** What goes over the wire to `add_students` for one validated row. */
export const toImportPayload = (row) => ({
  ref: row.id,
  admission_no: row.clean.admissionNo,
  name: row.clean.name,
  grade: row.clean.grade,
  section: row.clean.section,
  stype: row.clean.stype,
  house: row.clean.house,
  roll_no: row.clean.roll,
});

/** Counts for the summary strip. */
export function importTally(rows) {
  let ready = 0;
  let fix = 0;
  let warned = 0;
  for (const r of rows) {
    if (r.ok) ready += 1;
    else fix += 1;
    if (r.warnings.length) warned += 1;
  }
  return { total: rows.length, ready, fix, warned };
}

/** Every problem on a row as sentences, errors first. */
export const rowMessages = (row) => [
  ...Object.values(row.errors).map((text) => ({ tone: "danger", text })),
  ...row.warnings.map((text) => ({ tone: "warning", text })),
];

/**
 * The template's rows: the header, nothing else. An example row would be
 * imported by whoever forgets to delete it, which in a register means a
 * fictional child who is "absent" from every checkpoint for ever.
 */
export const templateHeader = () => IMPORT_COLUMNS.map((c) => c.header);
