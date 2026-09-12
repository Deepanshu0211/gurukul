import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import BottomSheet, { SheetOption } from "./BottomSheet";
import CalendarSheet from "./CalendarSheet";
import { PrimaryButton } from "./ui";
import { useDialog } from "./Dialog";
import { useAuth } from "../context/AuthContext";
import {
  buildReport,
  printReport,
  weekStart,
  addDays,
  lastSaturday,
  REPORT_FORMAT,
} from "../lib/report";
import { describeError } from "../lib/errors";
import { fmtDay, fmtDayCompact, isSaturday } from "../utils/format";
import { colors, spacing, typography } from "../theme/theme";

/**
 * Picking what to print, and printing it.
 *
 * Lifted out of ClassDayScreen when the coordinator got a sheet of their own.
 * The two screens print different DOCUMENTS — a register and a headcount — but
 * the choosing is identical: this day, this week, or two dates. Copying the
 * flow would have meant two calendars to keep in step, and the one that got
 * fixed would not be the one someone was using.
 *
 * The parent owns nothing but `visible`. Which step of the flow is showing,
 * the dates picked along the way and whether a build is in flight all live
 * here, because none of it means anything to the screen behind it.
 *
 * @param day     the day the screen is showing, as "YYYY-MM-DD" — the default
 * @param format  REPORT_FORMAT.REGISTER | REPORT_FORMAT.HEADCOUNT
 */
export default function PrintSheets({
  visible,
  onClose,
  day,
  format = REPORT_FORMAT.REGISTER,
  subtitle,
  // The class to print, or null for the whole school. A class teacher
  // pressing Print wants their own thirty children, not eleven pages of
  // the register to find them in — which is what this did before, because
  // the report was written when the register was one pilot class.
  classKey = null,
  classLabel = null,
}) {
  const { user } = useAuth();
  const dialog = useDialog();

  // Where in the flow we are: "export" (the three choices) | "range" (two
  // dates and a button) | "from" | "to" (the calendar). Stacking a calendar
  // modal on top of the sheet that opened it is unreliable on Android and
  // confusing anywhere, so the flow steps between them instead.
  const [step, setStep] = useState("export");
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState({ from: null, to: null });

  // Reopening always starts at the first choice. Without this, a flow closed
  // half way through the date pickers reopens on the calendar with no memory
  // of why it is there.
  useEffect(() => {
    if (visible) {
      setStep("export");
      setRange({ from: day, to: day });
    }
  }, [visible, day]);

  const close = () => {
    if (!exporting) onClose();
  };

  // `fmt` overrides the screen's format for one export. The Saturday assembly
  // sheet is a different document from the one this sheet is otherwise
  // printing, offered from the same list because it answers the same question
  // — "give me the printed record" — from the same place.
  const runExport = async (from, to, fmt = format) => {
    if (exporting) return;
    setExporting(true);
    try {
      const report = await buildReport({
        from,
        to,
        generatedBy: user?.name,
        format: fmt,
        // The headcount and the Saturday assembly sheet are school-wide
        // documents by definition, so they ignore the class even when one
        // is showing.
        classKey: fmt === REPORT_FORMAT.REGISTER ? classKey : null,
        classLabel: fmt === REPORT_FORMAT.REGISTER ? classLabel : null,
      });
      if (report.empty) {
        onClose();
        dialog.alert({
          icon: "document-outline",
          title: "Nothing to print",
          message:
            from === to
              ? "No checkpoint was submitted on this day."
              : "No checkpoint was submitted between these dates.",
        });
        return;
      }
      await printReport(report.html);
      onClose();
    } catch (e) {
      const shown = describeError(
        e,
        { title: "Could not create the PDF", message: "Something went wrong building the report." },
        null
      );
      // `shown.title` already falls back to the one passed above for failures
      // describeError does not recognise. Overriding it here — as this did
      // when it lived in ClassDayScreen — relabels the cases it DOES
      // recognise, so "the server is missing an update" printed under a
      // heading that says the PDF failed, which is the least useful half.
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.title,
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setExporting(false);
    }
  };

  const thisWeek = { from: weekStart(day), to: addDays(weekStart(day), 6) };

  // Which Saturday the assembly sheet will cover: the day on screen when that
  // is a Saturday, otherwise the Saturday just gone. The row states that date
  // like every other row here, so it never prints a day the reader did not
  // expect — the reason this is not simply hidden six days a week is that the
  // Dashboard has no date picker, and hiding it left the sheet unreachable on
  // the Monday morning somebody actually wants Saturday's page.
  //
  // Only the oversight sheet offers it: the form covers grades 2–12 and is
  // signed by the Principal, so it is not a class teacher's document.
  const showSaturday = format === REPORT_FORMAT.HEADCOUNT;
  const saturday = lastSaturday(day);

  const busy = (
    <View style={styles.busy}>
      <ActivityIndicator color={colors.primary} />
      <Text style={typography.caption}>Building the sheet…</Text>
    </View>
  );

  return (
    <>
      <BottomSheet
        visible={visible && step === "export"}
        onClose={close}
        title="Print attendance"
        subtitle={
          subtitle ||
          (format === REPORT_FORMAT.HEADCOUNT
            ? "A4 · counts, then who was not present"
            : "A4 · one row per student")
        }
        showClose
      >
        {exporting ? (
          busy
        ) : (
          <>
            {/* Each row says the dates it will use, so nothing depends on
                remembering what the screen behind the sheet is set to. The
                print dialog is also where "Save as PDF" lives, so one verb
                covers printing and saving. */}
            {showSaturday && (
              <SheetOption
                icon="ribbon-outline"
                label="Saturday assembly sheet"
                hint={`${
                  isSaturday(day) ? fmtDay(saturday) : fmtDayCompact(saturday)
                } · Grade 2–12 by house`}
                onPress={() => runExport(saturday, saturday, REPORT_FORMAT.SATURDAY)}
              />
            )}
            <SheetOption
              icon="today-outline"
              label="Print this day"
              hint={fmtDay(day)}
              onPress={() => runExport(day, day)}
            />
            <SheetOption
              icon="calendar-outline"
              label="Print this week"
              hint={`${fmtDayCompact(thisWeek.from)} to ${fmtDayCompact(thisWeek.to)}`}
              onPress={() => runExport(thisWeek.from, thisWeek.to)}
            />
            <SheetOption
              icon="calendar-number-outline"
              label="Choose dates"
              hint="Any two days"
              onPress={() => setStep("range")}
            />
          </>
        )}
      </BottomSheet>

      {/* Two dates and one button. Deliberately not a tap-start-then-tap-end
          range calendar: that mode has no visible state between the two taps,
          and getting it wrong looks like the app ignoring you. */}
      <BottomSheet
        visible={visible && step === "range"}
        onClose={close}
        title="Choose dates"
        subtitle="Both days are included"
        showClose
      >
        {exporting ? (
          busy
        ) : (
          <>
            <SheetOption
              icon="calendar-outline"
              label="From"
              hint={fmtDay(range.from || day)}
              onPress={() => setStep("from")}
            />
            <SheetOption
              icon="calendar-outline"
              label="To"
              hint={fmtDay(range.to || day)}
              onPress={() => setStep("to")}
            />
            <PrimaryButton
              title="Print"
              icon="print-outline"
              onPress={() => runExport(range.from || day, range.to || day)}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </BottomSheet>

      <CalendarSheet
        visible={visible && (step === "from" || step === "to")}
        selected={(step === "from" ? range.from : range.to) || day}
        onSelect={(picked) => {
          setRange((prev) => ({ ...prev, [step]: picked }));
          setStep("range");
        }}
        onClose={() => setStep("range")}
      />
    </>
  );
}

const styles = StyleSheet.create({
  busy: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
});
