import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/**
 * Just enough of the Excel (.xlsx) format to hand a teacher a template and to
 * read it back: plain cells — text, numbers, true/false — from the first sheet.
 *
 * WHY NOT A SPREADSHEET LIBRARY
 * The usual one, SheetJS, stopped publishing to npm at 0.18.5, and that
 * version has a known prototype-pollution bug when it PARSES a crafted file —
 * which is precisely what this does with a file somebody uploads. Its fixed
 * builds are only on its own CDN, and the whole library is around a megabyte
 * in a phone app. An .xlsx is a zip of XML; `fflate` (pure JS, no
 * dependencies) does the zip, and this file does the XML for the subset that
 * a register needs. No formulas are evaluated, no styles are read, nothing
 * is executed — a cell is only ever read as a string.
 *
 * Not supported: the old binary .xls format (it is not a zip at all). The
 * caller says so in words rather than failing on garbage.
 */

// ── Reading ─────────────────────────────────────────────────────────────────

const ENTITY = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

const decodeXml = (s) =>
  s
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITY[e.toLowerCase()] ?? m;
    })
    // Excel escapes control characters as _xHHHH_.
    .replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

/** All the <t> text inside one fragment, joined — rich-text runs included,
 *  phonetic guides (<rPh>) excluded. */
const textOf = (xml) => {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(clean))) out += m[1] ? decodeXml(m[1]) : "";
  return out;
};

const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};

/** "AB12" → 27 (zero-based column index). */
const columnIndex = (ref) => {
  const letters = /^[A-Z]+/i.exec(ref || "")?.[0];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/**
 * A number as Excel shows it in a General cell. Whole numbers come back as
 * digits: an admission number typed as 202102150 is stored as "202102150" or,
 * by some exporters, "2.0210215E8"; either way it must read 202102150, not
 * in scientific notation.
 */
const numberText = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Math.abs(n - Math.round(n)) < 1e-9 && Number.isSafeInteger(Math.round(n))) {
    return String(Math.round(n));
  }
  return String(n);
};

const normalisePath = (target) => {
  const t = target.replace(/^\/+/, "");
  return t.startsWith("xl/") ? t : `xl/${t}`;
};

/** True when the bytes are a zip — what every .xlsx is. */
export const looksLikeXlsx = (bytes) =>
  bytes?.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** True for the pre-2007 binary .xls (an OLE compound file). */
export const looksLikeOldXls = (bytes) =>
  bytes?.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;

/**
 * The first worksheet of an .xlsx as `string[][]` (rows of cell text, gaps
 * filled with ""). Stops after `maxRows` rows so a sheet with a million
 * formatted-but-empty rows cannot hang the phone.
 *
 * @returns {{ sheetName: string, rows: string[][], truncated: boolean }}
 */
export function readXlsx(bytes, { maxRows = Infinity } = {}) {
  const wanted = (name) =>
    name === "xl/workbook.xml" ||
    name === "xl/_rels/workbook.xml.rels" ||
    name === "xl/sharedStrings.xml" ||
    name.startsWith("xl/worksheets/sheet");
  const files = unzipSync(bytes, { filter: (f) => wanted(f.name) });
  const read = (name) => (files[name] ? strFromU8(files[name]) : null);

  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("This file is not an Excel workbook.");

  // The first sheet in the workbook's own order, which is not necessarily
  // sheet1.xml once sheets have been moved around.
  const first = /<sheet\b([^>]*)\/?>/.exec(workbook);
  const sheetName = first ? decodeXml(attr(first[1], "name") || "Sheet1") : "Sheet1";
  const relId = first ? attr(first[1], "r:id") : null;
  let sheetPath = "xl/worksheets/sheet1.xml";
  const rels = read("xl/_rels/workbook.xml.rels");
  if (rels && relId) {
    const re = /<Relationship\b([^>]*)\/?>/g;
    let m;
    while ((m = re.exec(rels))) {
      if (attr(m[1], "Id") === relId) {
        sheetPath = normalisePath(attr(m[1], "Target") || "");
        break;
      }
    }
  }
  const sheet = read(sheetPath) || read("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("This workbook has no sheet to read.");

  const shared = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) {
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
    let m;
    while ((m = re.exec(sst))) shared.push(m[1] ? textOf(m[1]) : "");
  }

  const rows = [];
  let truncated = false;
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm;
  while ((rm = rowRe.exec(sheet))) {
    const rowNo = Number(attr(rm[1], "r"));
    const index = Number.isFinite(rowNo) && rowNo > 0 ? rowNo - 1 : rows.length;
    if (index >= maxRows) {
      truncated = true;
      break;
    }
    const cells = [];
    if (rm[2]) {
      let cm;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(rm[2]))) {
        const attrs = cm[1];
        const body = cm[2] || "";
        const col = columnIndex(attr(attrs, "r"));
        const type = attr(attrs, "t");
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let text = "";
        if (type === "s") text = shared[Number(v)] ?? "";
        else if (type === "inlineStr") text = textOf(body);
        else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
        else if (type === "str" || type === "e") text = v != null ? decodeXml(v) : "";
        else if (v != null) text = numberText(decodeXml(v));
        cells[col >= 0 ? col : cells.length] = text;
      }
    }
    for (let i = 0; i < cells.length; i += 1) if (cells[i] == null) cells[i] = "";
    rows[index] = cells;
  }
  for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = [];
  return { sheetName, rows, truncated };
}

// ── Writing ─────────────────────────────────────────────────────────────────

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // XML 1.0 cannot carry most control characters at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const columnLetter = (i) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// Style indexes in STYLES below.
const STYLE = { normal: 0, header: 1, text: 2, wrap: 3, title: 4 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF035352"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet) {
  const {
    rows = [],
    widths = [],
    headerRow = false,
    textColumns = [],
    wrapColumns = [],
    titleRows = [],
    validations = [],
    blankRows = 0,
  } = sheet;
  const text = new Set(textColumns);
  const wrap = new Set(wrapColumns);
  const titles = new Set(titleRows);
  const columns = Math.max(widths.length, ...rows.map((r) => r.length), 1);

  const cols = Array.from({ length: columns }, (_, i) => {
    const w = widths[i] || 12;
    // A column-level text format, so what a teacher TYPES into an empty
    // admission-number cell stays text: 0123 keeps its zero, and a long
    // number never turns into 2.02E+08.
    const style = text.has(i) ? ` style="${STYLE.text}"` : "";
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${style}/>`;
  }).join("");

  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v == null || v === "") return "";
          const ref = `${columnLetter(ci)}${ri + 1}`;
          const style =
            headerRow && ri === 0
              ? STYLE.header
              : titles.has(ri)
                ? STYLE.title
                : text.has(ci)
                  ? STYLE.text
                  : wrap.has(ci)
                    ? STYLE.wrap
                    : STYLE.normal;
          const s = style ? ` s="${style}"` : "";
          if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");

  const lastRow = Math.max(rows.length, 1) + blankRows;
  const dv = validations
    .map((v) => {
      const col = columnLetter(v.col);
      const sqref = `${col}${v.from || 2}:${col}${v.to || lastRow}`;
      const msg =
        (v.title ? ` errorTitle="${escapeXml(v.title)}"` : "") +
        (v.message ? ` error="${escapeXml(v.message)}"` : "");
      if (v.type === "list") {
        // A literal list in the formula: Excel caps it at 255 characters.
        const list = `"${v.values.join(",")}"`.slice(0, 255);
        return `<dataValidation type="list" allowBlank="1" showErrorMessage="1"${msg} sqref="${sqref}"><formula1>${escapeXml(list)}</formula1></dataValidation>`;
      }
      if (v.type === "whole") {
        return `<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1"${msg} sqref="${sqref}"><formula1>${v.min}</formula1><formula2>${v.max}</formula2></dataValidation>`;
      }
      return "";
    })
    .filter(Boolean);

  const freeze = headerRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    freeze +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${body}</sheetData>` +
    (dv.length ? `<dataValidations count="${dv.length}">${dv.join("")}</dataValidations>` : "") +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `</worksheet>`
  );
}

/**
 * Build an .xlsx. Each sheet: `{ name, rows, widths?, headerRow?, textColumns?,
 * wrapColumns?, titleRows?, validations?, blankRows? }` where `validations`
 * are drop-downs (`{ col, type: "list", values }`) or number ranges
 * (`{ col, type: "whole", min, max }`) applied to `blankRows` rows below the
 * data — the rows the teacher is going to fill in.
 *
 * @returns {Uint8Array}
 */
export function writeXlsx({ sheets }) {
  const names = sheets.map((s, i) => escapeXml(String(s.name || `Sheet${i + 1}`).slice(0, 31)));
  const files = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join("") +
        `</Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `</workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}
