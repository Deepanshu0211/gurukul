import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  fetchDayReport,
  fetchRangeReport,
  fetchHeadcountReport,
  fetchSaturdayReport,
} from "./reportData";
import {
  dayReportHtml,
  rangeReportHtml,
  headcountReportHtml,
  saturdayReportHtml,
} from "./reportHtml";

/**
 * Turning a report into a PDF the office can file or hand to a parent.
 *
 * Two exits, because they answer different questions:
 *  - `print` opens the system dialog, which on both platforms also offers
 *    "Save as PDF". This is the one to reach for when a printer is in the room.
 *  - `share` writes the file and hands it to the share sheet — mail, WhatsApp,
 *    Drive. This is how a report leaves the building.
 *
 * Both take the SAME html, so what is printed and what is filed can never be
 * two different documents.
 */

/** Monday of the week containing `iso`, as "YYYY-MM-DD". */
export const weekStart = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // getDay() is 0 for Sunday; shift so the week runs Monday–Sunday.
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * The Saturday `iso` belongs to: itself if it is one, otherwise the Saturday
 * just gone.
 *
 * The assembly sheet was first offered only when the day already on screen was
 * a Saturday, which read as a faithful "only for Saturday" and was useless in
 * practice: the Dashboard has no date picker, so six days a week there was no
 * route to the sheet at all — including Monday morning, which is exactly when
 * the office goes looking for Saturday's page. The document is still always a
 * Saturday's; only the way in stopped depending on which day you ask.
 */
export const lastSaturday = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // getDay() is 6 for Saturday, so this is 0 on a Saturday and walks back
  // through Sunday (which returns the day before, not six days ahead).
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Who the sheet is for, which decides what is on it.
 *
 *  - REGISTER  every student, every checkpoint, one row each. What a class
 *              teacher reads down, and what goes in a file.
 *  - HEADCOUNT counts per checkpoint, then only the children who were not
 *              present, named and with the reason. What a coordinator reads
 *              across ten checkpoints and seven hundred children.
 *  - SATURDAY  the school's own assembly sheet: grade band × house, signed by
 *              the Assembly Co-ordinator, the MOD and the Principal. Unlike
 *              the other two this covers ONE checkpoint on ONE day, because
 *              that is what the paper form it replaces covers.
 *
 * A format, not a role: nothing here checks who is asking. The screens decide
 * which sheet to offer, and `domain/roles.js` decides which screens exist.
 */
export const REPORT_FORMAT = {
  REGISTER: "register",
  HEADCOUNT: "headcount",
  SATURDAY: "saturday",
};

/**
 * Builds the HTML for any date range. One entry point rather than a mode
 * flag: a single day is just a range whose ends are equal, and the caller
 * should not have to know which report that produces.
 */
/**
 * @param classKey   '8|BALRAM' to print one class, or null for the school.
 * @param classLabel 'Class 8 Balram', for the heading.
 *
 * The register formats are scoped; the headcount and the Saturday assembly
 * sheet are not, because both are school-wide documents by definition — a
 * one-class headcount is a register with the names taken out.
 */
export async function buildReport({
  from,
  to,
  generatedBy,
  format = REPORT_FORMAT.REGISTER,
  classKey = null,
  classLabel = null,
}) {
  // Picked out of order — swap rather than refuse. Rejecting it would mean an
  // error message to read and a second attempt, for something with exactly
  // one sensible interpretation.
  const [start, end] = from <= to ? [from, to] : [to, from];

  // The assembly sheet is a single morning by definition — a range would have
  // to stack twelve-row forms with no signature block that meant anything —
  // so a range collapses to its first day rather than being refused.
  if (format === REPORT_FORMAT.SATURDAY) {
    const data = await fetchSaturdayReport(start);
    return {
      html: saturdayReportHtml(data, { generatedBy }),
      name: `saturday-assembly-${start}`,
      // Never empty. The strengths come from the register, so an unsubmitted
      // morning prints the blank form with the class sizes already filled in
      // — which is the sheet somebody would otherwise be hunting for.
      empty: false,
    };
  }

  // The headcount reads the same whether it covers one day or a term — it is
  // counts either way — so it does not split on the range the way the
  // register has to.
  if (format === REPORT_FORMAT.HEADCOUNT) {
    const data = await fetchHeadcountReport(start, end);
    return {
      html: headcountReportHtml(data, { generatedBy }),
      name: start === end ? `headcount-${start}` : `headcount-${start}_to_${end}`,
      empty: data.checkpoints.length === 0,
    };
  }

  // A filename somebody can find again in a folder of them.
  const slug = classLabel
    ? classLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-"
    : "";

  if (start === end) {
    const data = await fetchDayReport(start, classKey);
    return {
      html: dayReportHtml(data, { generatedBy, classLabel }),
      name: `attendance-${slug}${start}`,
      empty: data.checkpoints.length === 0,
    };
  }

  const data = await fetchRangeReport(start, end, classKey);
  return {
    html: rangeReportHtml(data, { generatedBy, classLabel }),
    name: `attendance-${slug}${start}_to_${end}`,
    empty: data.totalMarks === 0,
  };
}

export async function printReport(html) {
  await Print.printAsync({ html });
}

// ── SAVING STRAIGHT TO A FOLDER ─────────────────────────────────────────────
// The print dialog's "Save as PDF" is four taps through a screen that looks
// like it is about to use paper. On Android the app asks for a folder ONCE
// (Downloads, say); Android keeps that permission, and every later PDF is
// written straight into it.

const FOLDER_KEY = "report.saveFolderUri";

/** Thrown when the person backs out of the folder picker. Not a failure. */
export class SaveCancelled extends Error {
  constructor() {
    super("Save cancelled");
    this.cancelled = true;
  }
}

const readFolder = async () => {
  try {
    const uri = await AsyncStorage.getItem(FOLDER_KEY);
    return uri ? new Directory(uri) : null;
  } catch {
    return null;
  }
};

const pickFolder = async () => {
  let dir;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch (e) {
    // Backing out is a choice; anything else is a real failure and must not
    // be swallowed as one.
    if (/cancel/i.test(e?.message || "")) throw new SaveCancelled();
    throw e;
  }
  if (!dir?.uri) throw new SaveCancelled();
  try {
    await AsyncStorage.setItem(FOLDER_KEY, dir.uri);
  } catch {
    // Not remembered — the next save asks again. Still saves this one.
  }
  return dir;
};

/** A readable folder name from a SAF uri: ".../tree/primary%3ADownload" -> "Download". */
const folderLabel = (dir) => {
  try {
    const tail = decodeURIComponent(dir.uri.split("/tree/").pop() || "");
    return tail.split(/[:/]/).filter(Boolean).pop() || "the chosen folder";
  } catch {
    return "the chosen folder";
  }
};

/** Forget the remembered folder, so the next save asks where to put it. */
export async function forgetSaveFolder() {
  try {
    await AsyncStorage.removeItem(FOLDER_KEY);
  } catch {
    // nothing to forget
  }
}

/**
 * Write the report as a PDF without the print dialog.
 *
 * Android: into the remembered folder (asking for one the first time, or
 * again if the permission was lost). iOS has no shared Downloads folder, so it
 * opens the share sheet, where "Save to Files" is. Web: the browser's own
 * print/save dialog is the only way to hand over a file.
 *
 * @returns {{ where: string | null }} the folder it went into, when known
 */
export async function savePdf(html, name) {
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return { where: null };
  }

  const { file, base64 } = await makePdf(html, name);
  const uri = file.uri;

  if (Platform.OS !== "android") {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: name });
    return { where: null };
  }

  try {
    return await saveIntoFolder(base64, name);
  } catch (e) {
    if (e?.cancelled) throw e;
    // The direct save failed — an older app build without the folder API, a
    // storage provider that refuses the write. The PDF is already made, so
    // hand it to the share sheet ("Save to Files", Drive) rather than lose it.
    console.warn("Direct PDF save failed, falling back to share:", e?.message || e);
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: name });
    return { where: null };
  }
}

async function saveIntoFolder(base64, name) {
  const writeInto = (dir) => {
    // No extension: the provider adds ".pdf" from the mime type, and a name
    // that is already taken gets " (1)" rather than overwriting a report.
    const out = dir.createFile(name, "application/pdf");
    out.write(base64, { encoding: "base64" });
  };

  let dir = await readFolder();
  if (dir) {
    try {
      writeInto(dir);
      return { where: folderLabel(dir) };
    } catch {
      // The folder was deleted or the permission revoked. Ask again below.
      await forgetSaveFolder();
    }
  }

  dir = await pickFolder();
  writeInto(dir);
  return { where: folderLabel(dir) };
}

/**
 * The PDF as a file this app can read back.
 *
 * `printToFileAsync` writes into a cache folder that, on some builds (Expo Go
 * among them), is outside what the file and sharing modules are allowed to
 * read — "Not allowed to read file under given URL". So the PDF comes back as
 * base64 and is written into the app's OWN cache folder instead.
 */
async function makePdf(html, name) {
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error("The PDF came back empty.");
  const safe = (name || "report").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const file = new File(Paths.cache, `${safe}.pdf`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: "base64" });
  return { file, base64 };
}

export async function shareReport(html, name) {
  const { file } = await makePdf(html, name);
  const uri = file.uri;

  if (!(await Sharing.isAvailableAsync())) {
    // Rare — some Android builds have no share target at all. The file is
    // written either way, so say where it is rather than failing silently.
    throw new Error(`Sharing is unavailable on this device. The file was saved to ${uri}`);
  }

  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    // Android's chooser title; iOS ignores it.
    dialogTitle: name,
    UTI: "com.adobe.pdf",
  });
  return uri;
}

/** iOS names the shared file from its temporary path, so a readable name has
 *  to come from the caller; Android takes it from the chooser. */
export const canRename = Platform.OS === "android";
