import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { fetchDayReport, fetchRangeReport } from "./reportData";
import { dayReportHtml, rangeReportHtml } from "./reportHtml";

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

export const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Builds the HTML for any date range. One entry point rather than a mode
 * flag: a single day is just a range whose ends are equal, and the caller
 * should not have to know which report that produces.
 */
export async function buildReport({ from, to, generatedBy }) {
  // Picked out of order — swap rather than refuse. Rejecting it would mean an
  // error message to read and a second attempt, for something with exactly
  // one sensible interpretation.
  const [start, end] = from <= to ? [from, to] : [to, from];

  if (start === end) {
    const data = await fetchDayReport(start);
    return {
      html: dayReportHtml(data, { generatedBy }),
      name: `attendance-${start}`,
      empty: data.checkpoints.length === 0,
    };
  }

  const data = await fetchRangeReport(start, end);
  return {
    html: rangeReportHtml(data, { generatedBy }),
    name: `attendance-${start}_to_${end}`,
    empty: data.totalMarks === 0,
  };
}

export async function printReport(html) {
  await Print.printAsync({ html });
}

export async function shareReport(html, name) {
  const { uri } = await Print.printToFileAsync({ html, base64: false });

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
