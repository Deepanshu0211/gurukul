import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { strFromU8, strToU8 } from "fflate";
import { parseCsv, toCsv } from "../utils/csv";
import { readXlsx, writeXlsx, looksLikeXlsx, looksLikeOldXls } from "../utils/xlsx";
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  STUDENT_TYPE_VALUES,
  templateHeader,
  toImportPayload,
} from "../domain/studentImport";
import { addStudents, findAdmissionNumbers } from "./students";

/**
 * Files in and out for the bulk student import, and sending the rows.
 *
 * The rules for what a row must say live in `domain/studentImport.js`; this
 * file only moves bytes and talks to the server.
 */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv";
/** Far more than two thousand rows of text; mostly a guard against picking a video. */
const MAX_BYTES = 5 * 1024 * 1024;

/** An error whose message is already written for a teacher (lib/errors → isExplained). */
const explained = (message) => Object.assign(new Error(message), { code: "22023" });

// ── The template ────────────────────────────────────────────────────────────

/**
 * The template as a file. The .xlsx carries what a CSV cannot: drop-downs for
 * Student Type and House, Admission No formatted as text (so 0123 keeps its
 * zero and long numbers never turn into 2.02E+08), a frozen header, and a
 * second sheet explaining each column with the classes this person can add to.
 */
export function buildTemplate(format, { classes = [], houses = [], ownClassLabel = null, mayStartClass = false }) {
  if (format === "csv") {
    return { bytes: strToU8(toCsv([templateHeader()])), mime: CSV_MIME, ext: "csv" };
  }

  const col = (key) => IMPORT_COLUMNS.findIndex((c) => c.key === key);
  const help = [
    ["How to fill in the student template"],
    [],
    ["Column", "What to write"],
    ...IMPORT_COLUMNS.map((c) => [c.header, c.help]),
    [],
    ["One student per row on the Students sheet. Leave the headings as they are."],
    ["Every student is checked before anything is saved: you will see each problem and can fix it in the app."],
    ...(ownClassLabel ? [[`Leave Grade and Section blank to add the student to your class, ${ownClassLabel}.`]] : []),
    [
      mayStartClass
        ? "A Grade and Section nobody is in yet starts a new class."
        : "Students can only be added to classes that already exist. A coordinator starts new classes.",
    ],
    [],
    ["Student types", STUDENT_TYPE_VALUES.join(", ")],
    ["Houses", houses.join(", ")],
    ["Classes on the register", classes.join(", ")],
  ];

  const bytes = writeXlsx({
    sheets: [
      {
        name: "Students",
        rows: [templateHeader()],
        widths: IMPORT_COLUMNS.map((c) => c.width),
        headerRow: true,
        textColumns: [col("admissionNo"), col("section")],
        blankRows: MAX_IMPORT_ROWS,
        validations: [
          {
            col: col("stype"),
            type: "list",
            values: STUDENT_TYPE_VALUES,
            title: "Student type",
            message: "Choose Residential, Day Scholar, Day Boarding or Vedic School.",
          },
          ...(houses.length
            ? [{ col: col("house"), type: "list", values: houses, title: "House", message: "Choose one of the school's houses." }]
            : []),
          { col: col("grade"), type: "whole", min: 1, max: 12, title: "Grade", message: "Grade is a number from 1 to 12." },
          { col: col("roll"), type: "whole", min: 1, max: 9999, title: "Roll No", message: "A whole number, or leave it blank." },
        ],
      },
      {
        name: "How to fill",
        rows: help,
        widths: [24, 90],
        wrapColumns: [1],
        titleRows: [0],
      },
    ],
  });
  return { bytes, mime: XLSX_MIME, ext: "xlsx" };
}

/**
 * Hand the template to the person. Web: a normal browser download. Phone: the
 * share sheet — "Save to Files", Drive, email it to the office computer.
 */
export async function saveTemplate(format, context) {
  const { bytes, mime, ext } = buildTemplate(format, context);
  const name = `student-import-template.${ext}`;

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { shared: false };
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  // writeSync: since SDK 58 `write` returns before the bytes are on disk.
  file.writeSync(bytes);
  if (!(await Sharing.isAvailableAsync())) {
    throw explained(`Sharing is unavailable on this device. The template was saved to ${file.uri}`);
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: mime,
    dialogTitle: "Student import template",
    UTI: ext === "xlsx" ? "org.openxmlformats.spreadsheetml.sheet" : "public.comma-separated-values-text",
  });
  return { shared: true };
}

// ── Picking and reading the filled-in file ──────────────────────────────────

/** Web: a hidden file input. Resolves null when the dialog is cancelled. */
function pickOnWeb() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.csv,.xls,text/csv," + XLSX_MIME;
    input.style.display = "none";
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener("cancel", () => done(null));
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      if (!f) return done(null);
      try {
        if (f.size > MAX_BYTES) throw explained("That file is larger than 5 MB. Is it the student list?");
        done({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      } catch (e) {
        settled = true;
        input.remove();
        reject(e);
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Let the person choose the filled-in template.
 *
 * Uses expo-file-system's own picker, which the app already ships, rather
 * than adding expo-document-picker — a new native module would mean a new
 * APK for every phone before this screen could work. Bytes are read with
 * `file.bytes()`, never `fetch(file://)`, which returns an EMPTY buffer on
 * React Native (docs/ARCHITECTURE.md).
 *
 * @returns {Promise<{ name: string, bytes: Uint8Array } | null>} null when cancelled
 */
export async function pickSpreadsheet() {
  if (Platform.OS === "web") return pickOnWeb();

  const res = await File.pickFileAsync({ mimeTypes: ["*/*"] });
  // The result shape changed across SDKs: `{ canceled, result }` now, a bare
  // File before. Accept both rather than break on an older build.
  if (!res || res.canceled) return null;
  const file = res.result ?? res;
  if (!file?.uri) return null;
  if (file.size > MAX_BYTES) throw explained("That file is larger than 5 MB. Is it the student list?");
  return { name: file.name || "students", bytes: await file.bytes() };
}

/**
 * The picked file's rows as `string[][]`, whatever it is: .xlsx by its zip
 * signature, anything else read as CSV text. Decided by content, not by the
 * name — Android often hands back "document:1234" with no extension at all.
 */
export function readSpreadsheet({ name, bytes }) {
  if (!bytes || bytes.length === 0) throw explained("That file is empty.");
  if (looksLikeOldXls(bytes)) {
    throw explained(
      "This is an old-style Excel file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then upload that."
    );
  }
  if (looksLikeXlsx(bytes)) {
    try {
      // One row more than the limit, so "too many" is reported rather than silently cut.
      return readXlsx(bytes, { maxRows: MAX_IMPORT_ROWS + 12 }).rows;
    } catch {
      throw explained(`“${name}” could not be read as an Excel workbook. Save it again as .xlsx or CSV and retry.`);
    }
  }
  const text = strFromU8(bytes);
  // A binary file that is neither: a PDF, a photo of the register, a .docx.
  if (/[\u0000-\u0008]/.test(text.slice(0, 2000))) {
    throw explained(`“${name}” is not a spreadsheet. Upload the template as .xlsx or CSV.`);
  }
  return parseCsv(text);
}

/** Admission numbers the database already holds for this file, leavers included. */
export const lookupAdmissions = (numbers) => findAdmissionNumbers(numbers);

// ── Sending ─────────────────────────────────────────────────────────────────

export const IMPORT_BATCH = 100;

/** Let the UI paint between steps of long synchronous work. */
export const nextFrame = () => new Promise((r) => setTimeout(r, 0));

/**
 * Send ready rows in batches of 100, reporting progress after each.
 *
 * A batch that fails in transit (signal drops mid-request) is ambiguous: the
 * server may or may not have saved it. Rather than guess, the numbers in that
 * batch are looked up — any that are now on the register WERE saved and are
 * reported as added — and the import stops so the teacher can retry the rest
 * when they have signal. Nothing is ever sent twice blind.
 *
 * @returns {{ added: Map<ref, result>, failed: Map<ref, message>, stopped: Error | null,
 *             dutiesError: string | null }}
 */
export async function importRows(rows, { onProgress } = {}) {
  const added = new Map();
  const failed = new Map();
  let dutiesError = null;
  let stopped = null;

  for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
    const batch = rows.slice(i, i + IMPORT_BATCH);
    try {
      const res = await addStudents(batch.map(toImportPayload));
      for (const r of res.results) {
        if (r.ok) added.set(r.ref, r);
        else failed.set(r.ref, r.message || "Not added.");
      }
      // A ref the server did not answer for is a failure, not a silent skip.
      for (const row of batch) {
        if (!added.has(row.id) && !failed.has(row.id)) failed.set(row.id, "The server did not confirm this student.");
      }
      if (res.dutiesError) dutiesError = res.dutiesError;
    } catch (e) {
      try {
        const now = await findAdmissionNumbers(batch.map((r) => r.clean.admissionNo));
        for (const row of batch) {
          const hit = now.get(row.clean.admissionNo);
          if (hit?.active && hit.name === row.clean.name) {
            added.set(row.id, { ref: row.id, ok: true, admission_no: row.clean.admissionNo });
          }
        }
      } catch {
        // Still offline. The unconfirmed rows stay in the list as not added;
        // the duplicate check on the next try catches any that did land.
      }
      stopped = e;
      onProgress?.(Math.min(i + batch.length, rows.length), rows.length);
      break;
    }
    onProgress?.(Math.min(i + batch.length, rows.length), rows.length);
  }
  return { added, failed, stopped, dutiesError };
}
