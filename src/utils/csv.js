/**
 * CSV in and out, by RFC 4180: quoted fields, doubled quotes inside them,
 * line breaks inside quotes, CRLF or LF.
 *
 * The delimiter is detected rather than assumed. Excel saves "CSV" with
 * semicolons on any machine whose locale writes decimals with a comma, and a
 * school office laptop set up for India-English one year and something else
 * the next is exactly where that bites.
 */

const DELIMITERS = [",", ";", "\t"];

/** The delimiter that splits the first line into the most fields, outside quotes. */
function detectDelimiter(text) {
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && (ch === "\n" || ch === "\r")) break;
      else if (!quoted && ch === d) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** `string` → `string[][]`. A leading byte-order mark is dropped. */
export function parseCsv(input) {
  const text = String(input || "").replace(/^﻿/, "");
  const d = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuotes = /[",\r\n;\t]/;

/** `string[][]` → CSV text, CRLF line ends, with a BOM so Excel reads UTF-8. */
export function toCsv(rows) {
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
