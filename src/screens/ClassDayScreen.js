import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, layout, typography, numeric } from "../theme/theme";
import { useTabContentInset, useScreenTopInset } from "../navigation/tabBarInset";
import ScreenHeader from "../components/ScreenHeader";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import CalendarSheet from "../components/CalendarSheet";
import SearchField from "../components/SearchField";
import { EmptyState, PrimaryButton } from "../components/ui";
import { fmtTime, fmtDay, fmtDayCompact, fmtClock, plural, todayISO } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { useDayAttendance, useMarkingTotals } from "../lib/history";
import { resolveGroup } from "../lib/duties";
import { useStudentHistory, RANGES } from "../lib/studentHistory";
import { buildReport, printReport, weekStart, addDays } from "../lib/report";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { STATUS_META } from "../data/mockData";

/**
 * Reading attendance back: pick a day, pick a checkpoint, see the whole group
 * that checkpoint covered and where every child was.
 *
 * Scope is the CHECKPOINT'S group, not the reader's own class. Mangalarati
 * covers every residential student, so it lists all ~300 of them; a
 * class-section duty lists that section. An earlier version intersected the
 * group with the signed-in teacher's class, which quietly turned a 300-child
 * roll call into 14 rows and made the count on screen wrong rather than
 * merely narrow.
 *
 * This replaced a student × checkpoint matrix. The matrix fitted a whole day
 * on one screen, but every cell was a 24px dot with no room for a name, a
 * time, or who marked it — and the question a teacher actually arrives with
 * is about ONE roll call ("was he at Mangalarati on Tuesday?"), not the grid.
 *
 * The three numbers at the top are the reader's own marking record: they
 * answer "how much have I done", which nothing else in the app reported.
 */

/** Fixed so the list can skip measuring 300 rows and jump straight to an
 *  offset. Must match `styles.row.height` exactly. */
const ROW_H = layout.row;

/** SearchField's own minHeight. The header reserves exactly this much, so
 *  nothing shifts when the field lifts out of the flow to be positioned
 *  absolutely. The gap above it is the slot's MARGIN, not part of its height —
 *  onLayout reports y after the margin, so the measurement lands on the
 *  field's true top rather than the top of the gap. */
const SEARCH_H = layout.touch + 2;

const statusLabel = (code) => (code === "P" ? "Present" : STATUS_META[code]?.label || code);

/** "Today" and "Yesterday" are adverbs; a date needs a preposition. Without
 *  this the sheet read "Submitted on Yesterday". */
const onDay = (iso) => {
  const named = fmtDay(iso);
  return named === "Today" || named === "Yesterday" ? named.toLowerCase() : `on ${named}`;
};

export default function ClassDayScreen() {
  const { user } = useAuth();
  const {
    students,
    duties: liveDuties,
    records: liveRecords,
    staffName,
    refresh,
  } = useSchoolData();
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();

  // The day the app is currently working on. Usually today, but the duty
  // generator does not run yet, so the live set can be the most recent day
  // that has duties — read it from the data rather than assuming.
  const liveDay = liveDuties[0]?.day || todayISO();
  // null means "the live day", so the default view needs no fetch at all.
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDutyId, setSelectedDutyId] = useState(null);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoFor, setInfoFor] = useState(null);
  // One sheet at a time: null | "export" | "range" | "from" | "to". Stacking a
  // calendar modal on top of the sheet that opened it is unreliable on
  // Android and confusing anywhere, so the flow steps between them instead.
  const [sheet, setSheet] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState({ from: null, to: null });
  const [query, setQuery] = useState("");
  // Which status floats to the top. null = the register's own order, which is
  // by roll number and is what a teacher reading down a printed list expects.
  const [sortBy, setSortBy] = useState(null);

  // Where the inline search sits inside the scrolling header. Measured rather
  // than guessed: the header's height changes with the checkpoint name, the
  // group label and whether the "overruled by" line is showing.
  const [searchTop, setSearchTop] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  const dialog = useDialog();
  const toast = useToast();

  const isPast = !!selectedDay && selectedDay !== liveDay;
  const past = useDayAttendance(isPast ? selectedDay : null);

  const duties = isPast ? past.duties : liveDuties;
  const records = isPast ? past.records : liveRecords;
  const day = selectedDay || liveDay;

  // Re-tallied whenever a checkpoint is submitted — the record count is what
  // changes then, not the duty count, which is fixed for the day.
  const totals = useMarkingTotals(user?.id, Object.keys(liveRecords).length);

  useFocusEffect(
    useCallback(() => {
      if (!isPast) refresh();
    }, [refresh, isPast])
  );

  // Only submitted checkpoints have anything to show. A duty has a record
  // exactly when it was submitted, which holds for any day — no clock needed.
  const submitted = useMemo(
    () => duties.filter((d) => records[d.id]).sort((a, b) => a.start - b.start),
    [duties, records]
  );

  // Falling back to the first checkpoint rather than tracking the day change
  // in an effect: when the teacher moves to a day that has no 'morn-4A', the
  // selection simply stops matching and the earliest checkpoint takes over.
  const activeDuty = useMemo(
    () => submitted.find((d) => d.id === selectedDutyId) || submitted[0] || null,
    [submitted, selectedDutyId]
  );

  // Everyone the checkpoint covered — the same set the duty teacher marked,
  // in the same order, so the two screens can be read against each other.
  const roster = useMemo(
    () => (activeDuty ? resolveGroup(activeDuty, students) : []),
    [activeDuty, students]
  );

  const statusOf = useCallback(
    (studentId, duty) => (duty ? records[duty.id]?.statuses[studentId] || "P" : null),
    [records]
  );

  const tally = useMemo(() => {
    let present = 0;
    let absent = 0;
    let elsewhere = 0;
    roster.forEach((s) => {
      const code = statusOf(s.id, activeDuty);
      if (code === "A") absent += 1;
      else if (code === "P") present += 1;
      else elsewhere += 1;
    });
    return { present, absent, elsewhere };
  }, [roster, activeDuty, statusOf]);

  /**
   * Search, then sort. Both derived rather than held in state, so the list can
   * never disagree with the roster behind it.
   *
   * The sort is stable and only lifts one group: `roster` arrives in roll
   * order, so tapping "absent" gives absentees in roll order followed by
   * everyone else in roll order. A full re-sort would scramble the second
   * group for no reason, and the roll order is the one a teacher can check
   * against a paper list.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? roster.filter(
          (s) => s.name.toLowerCase().includes(q) || String(s.roll || "").includes(q)
        )
      : roster;

    if (!sortBy) return found;

    const first = (s) => {
      const code = statusOf(s.id, activeDuty);
      if (sortBy === "P") return code === "P";
      if (sortBy === "A") return code === "A";
      return code !== "P" && code !== "A"; // elsewhere
    };
    return [...found].sort((a, b) => (first(b) ? 1 : 0) - (first(a) ? 1 : 0));
  }, [roster, query, sortBy, statusOf, activeDuty]);

  /**
   * Every submitted checkpoint's verdict for the student whose sheet is open.
   * Memoised because `resolveGroup` filters and sorts the whole 415-student
   * register once per checkpoint — recomputing that on every render while a
   * sheet sits open is ten full passes for a list that cannot have changed.
   */
  const infoEntries = useMemo(() => {
    if (!infoFor) return [];
    return submitted.map((d) => ({
      duty: d,
      code: resolveGroup(d, students).some((s) => s.id === infoFor.id)
        ? statusOf(infoFor.id, d)
        : null,
    }));
  }, [infoFor, submitted, students, statusOf]);

  const renderStudent = useCallback(
    ({ item }) => (
      <StudentRow
        student={item}
        code={statusOf(item.id, activeDuty)}
        onInfo={() => setInfoFor(item)}
      />
    ),
    [statusOf, activeDuty]
  );

  const rec = activeDuty ? records[activeDuty.id] : null;

  /** Builds the sheet, then either prints it or hands it to the share sheet. */
  const runExport = async (from, to) => {
    if (exporting) return;
    setExporting(true);
    try {
      const report = await buildReport({ from, to, generatedBy: user?.name });
      if (report.empty) {
        setSheet(null);
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
      setSheet(null);
    } catch (e) {
      dialog.alert({
        icon: "alert-circle-outline",
        title: "Could not create the PDF",
        message: e.message || "Something went wrong building the report.",
        destructive: true,
      });
    } finally {
      setExporting(false);
    }
  };

  const thisWeek = { from: weekStart(day), to: addDays(weekStart(day), 6) };

  // Purely native-driven now: nothing about this animation needs a value read
  // back on the JS thread, so there is no listener and no per-frame setState.
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY]
  );

  // The field's screen position: it starts at its place in the header and
  // travels up with the content until it reaches the top inset, then stays.
  // `extrapolate: "clamp"` is what makes it stop rather than keep going.
  // inputRange must strictly increase, hence the guard before it is measured.
  const travel = Math.max(searchTop, 1);
  const pinStyle = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, travel],
          outputRange: [topInset + travel, topInset],
          extrapolate: "clamp",
        }),
      },
    ],
  };

  // Fades in over the last 24px of that travel, so the bar lands rather than
  // appears. Opacity is native-driver safe; backgroundColor would not be.
  const backdropStyle = {
    opacity: scrollY.interpolate({
      inputRange: [Math.max(travel - 24, 0), travel],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
  };

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        eyebrow="Attendance"
        title="Records"
        subtitle={
          activeDuty
            ? `${activeDuty.group} · ${plural(roster.length, "student")}`
            : "Pick a day to read back"
        }
        right={
          <TouchableOpacity
            onPress={() => setSheet("export")}
            activeOpacity={0.7}
            style={styles.printBtn}
            accessibilityRole="button"
            accessibilityLabel="Print or share attendance"
          >
            <Ionicons name="print-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <StatStrip totals={totals} />

      {/* One joined control, full width, split by a hairline. As two separate
          content-width pills this row ended in a band of empty background
          that read as a layout mistake; as two halves of one bar the date
          takes what it needs and the checkpoint centres itself in the rest,
          so the slack becomes padding around the name instead of a gap
          after it. */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => setCalendarOpen(true)}
          activeOpacity={0.7}
          style={styles.control}
          accessibilityRole="button"
          accessibilityLabel={`Date: ${fmtDay(day)}. Choose another`}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={styles.controlText} numberOfLines={1}>
            {fmtDayCompact(day)}
          </Text>
        </TouchableOpacity>

        <View style={styles.controlDivider} />

        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          disabled={submitted.length === 0}
          activeOpacity={0.7}
          style={[styles.control, styles.controlGrow, !submitted.length && styles.controlOff]}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitted.length === 0 }}
          accessibilityLabel={
            activeDuty
              ? `Checkpoint: ${activeDuty.checkpoint}. Choose another`
              : "No checkpoints to choose"
          }
        >
          <Text style={styles.controlText} numberOfLines={1}>
            {activeDuty ? activeDuty.checkpoint : "No checkpoints"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.icon} />
        </TouchableOpacity>
      </View>

      {activeDuty && (
        <View style={styles.context}>
          <Text style={styles.contextTitle} numberOfLines={2}>
            {activeDuty.checkpoint} · {fmtTime(activeDuty.start)}
          </Text>
          <Text style={styles.contextMeta} numberOfLines={2}>
            {`Marked by ${staffName(rec?.submittedBy) || "a colleague"}`}
            {rec?.submittedAt ? ` · ${fmtClock(rec.submittedAt)}` : ""}
          </Text>

          {/* An overrule leaves the original submitter on the record, so
              without this line a corrected checkpoint is indistinguishable
              from one nobody touched. */}
          {!!rec?.correctedBy && (
            <View style={styles.corrected}>
              <Ionicons name="create-outline" size={13} color={colors.warning} />
              <Text style={styles.correctedText} numberOfLines={2}>
                Overruled by {staffName(rec.correctedBy) || "an overseer"}
                {rec.correctedAt ? ` · ${fmtClock(rec.correctedAt)}` : ""}
              </Text>
            </View>
          )}

          {/* The tallies double as the sort control: tapping one lifts that
              group to the top, tapping it again drops back to roll order.
              A separate row of sort buttons would say the same numbers twice. */}
          <View style={styles.tally}>
            <TallyChip
              value={tally.present}
              label="present"
              tone="success"
              active={sortBy === "P"}
              onPress={() => setSortBy((v) => (v === "P" ? null : "P"))}
            />
            {tally.absent > 0 && (
              <TallyChip
                value={tally.absent}
                label="absent"
                tone="danger"
                active={sortBy === "A"}
                onPress={() => setSortBy((v) => (v === "A" ? null : "A"))}
              />
            )}
            {tally.elsewhere > 0 && (
              <TallyChip
                value={tally.elsewhere}
                label="elsewhere"
                tone="neutral"
                active={sortBy === "E"}
                onPress={() => setSortBy((v) => (v === "E" ? null : "E"))}
              />
            )}
          </View>

        </View>
      )}

      {/* A hole the search field sits in, not a second field: the field is
          rendered once, over the list, and slides up with the content until
          it reaches the top.

          A DIRECT child of the header on purpose. onLayout reports y relative
          to the immediate parent, so nested inside the context block it
          measured ~60 instead of its true offset and the field parked near the
          top from the start. The header is at content offset 0, so measured
          here the number IS the scroll position at which it should stop. */}
      <View
        style={styles.searchSlot}
        onLayout={(e) => {
          const y = Math.round(e.nativeEvent.layout.y);
          setSearchTop((prev) => (Math.abs(prev - y) > 1 ? y : prev));
        }}
      />
    </View>
  );

  // Null when there ARE rows to show. Built once and reused for both the
  // empty component and the decision to pass an empty list.
  const placeholder = (() => {
    if (past.loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centeredText}>Loading {fmtDay(day)}…</Text>
        </View>
      );
    }
    if (past.error) {
      return <EmptyState icon="cloud-offline-outline" title="Can't load that day" body={past.error} />;
    }
    if (!activeDuty) {
      return (
        <EmptyState
          icon="time-outline"
          title={isPast ? "Nothing was marked" : "Nothing marked yet"}
          body={
            isPast
              ? "No checkpoint was submitted on this day. Pick another date above."
              : "Statuses appear here as duty teachers submit each checkpoint."
          }
        />
      );
    }
    // A query that matches nobody is not the same as a checkpoint with nobody
    // in it — saying "nobody in this group" here would read as a data problem.
    if (roster.length > 0 && visible.length === 0) {
      return (
        <EmptyState
          icon="search-outline"
          title="No match"
          body={`No student in this group matches “${query.trim()}”.`}
          compact
        />
      );
    }
    if (roster.length === 0) {
      return (
        <EmptyState
          icon="people-outline"
          title="Nobody in this group"
          body={`${activeDuty.checkpoint} covers ${activeDuty.group}, which no student in the register matches.`}
        />
      );
    }
    return null;
  })();

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <Animated.FlatList
        data={placeholder ? [] : visible}
        keyExtractor={(s) => s.id}
        renderItem={renderStudent}
        ListHeaderComponent={header}
        ListEmptyComponent={placeholder}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: tabInset }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Deliberately NO getItemLayout, even though rows are a fixed height:
        // ListMetricsAggregator returns its offsets verbatim and never adds
        // the ListHeaderComponent's height, so with a header this tall every
        // cell offset would be understated by ~300px and the visible window
        // would be computed against the wrong part of the list.
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={11}
      />

      {/* The backdrop appears only once the field has landed, so while it is
          still travelling with the content the page shows through behind it. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.pinBackdrop, { height: topInset + SEARCH_H + spacing.sm }, backdropStyle]}
      />

      <Animated.View style={[styles.pinned, pinStyle]}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Find a name or roll number"
          hint={`${visible.length}/${roster.length}`}
          accessibilityLabel="Find a student in this group"
        />
      </Animated.View>

      <CalendarSheet
        visible={calendarOpen}
        selected={day}
        onSelect={(d) => {
          setSelectedDay(d === liveDay ? null : d);
          // The new day has its own checkpoints; keeping the old id would just
          // fail to match and silently fall back anyway.
          setSelectedDutyId(null);
        }}
        onClose={() => setCalendarOpen(false)}
      />

      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Checkpoint"
        subtitle={`Submitted ${onDay(day)}`}
        showClose
      >
        {submitted.map((d) => (
          <SheetOption
            key={d.id}
            label={d.checkpoint}
            hint={`${fmtTime(d.start)} · ${d.group}`}
            active={activeDuty?.id === d.id}
            onPress={() => {
              setSelectedDutyId(d.id);
              setPickerOpen(false);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={sheet === "export"}
        onClose={() => !exporting && setSheet(null)}
        title="Print attendance"
        subtitle="A4 · one row per student"
        showClose
      >
        {exporting ? (
          <View style={styles.exportBusy}>
            <ActivityIndicator color={colors.primary} />
            <Text style={typography.caption}>Building the sheet…</Text>
          </View>
        ) : (
          <>
            {/* Each row says the dates it will use, so nothing depends on
                remembering what the screen behind the sheet is set to. The
                print dialog is also where "Save as PDF" lives, so one verb
                covers printing and saving. */}
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
              onPress={() => {
                setRange({ from: day, to: day });
                setSheet("range");
              }}
            />
          </>
        )}
      </BottomSheet>

      {/* Two dates and one button. Deliberately not a tap-start-then-tap-end
          range calendar: that mode has no visible state between the two taps,
          and getting it wrong looks like the app ignoring you. */}
      <BottomSheet
        visible={sheet === "range"}
        onClose={() => !exporting && setSheet(null)}
        title="Choose dates"
        subtitle="Both days are included"
        showClose
      >
        {exporting ? (
          <View style={styles.exportBusy}>
            <ActivityIndicator color={colors.primary} />
            <Text style={typography.caption}>Building the sheet…</Text>
          </View>
        ) : (
          <>
            <SheetOption
              icon="calendar-outline"
              label="From"
              hint={fmtDay(range.from || day)}
              onPress={() => setSheet("from")}
            />
            <SheetOption
              icon="calendar-outline"
              label="To"
              hint={fmtDay(range.to || day)}
              onPress={() => setSheet("to")}
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
        visible={sheet === "from" || sheet === "to"}
        selected={(sheet === "from" ? range.from : range.to) || day}
        onSelect={(picked) => {
          setRange((prev) => ({ ...prev, [sheet]: picked }));
          setSheet("range");
        }}
        onClose={() => setSheet("range")}
      />

      <StudentInfoSheet
        student={infoFor}
        day={day}
        entries={infoEntries}
        onClose={() => setInfoFor(null)}
      />
    </SafeAreaView>
  );
}

/** The teacher's own marking record, all-time. */
function StatStrip({ totals }) {
  return (
    <View style={styles.strip}>
      <StripCell value={totals.taken} label="Attendance taken" loading={totals.loading} />
      <View style={styles.stripDivider} />
      <StripCell value={totals.marked} label="Students marked" loading={totals.loading} />
      <View style={styles.stripDivider} />
      <StripCell
        value={totals.absent}
        label="Absences found"
        tone={totals.absent > 0 ? colors.danger : undefined}
        loading={totals.loading}
      />
    </View>
  );
}

function StripCell({ value, label, tone, loading }) {
  return (
    <View style={styles.stripCell}>
      <Text style={[styles.stripValue, !!tone && { color: tone }]}>{loading ? "—" : value}</Text>
      <Text style={styles.stripLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function TallyChip({ value, label, tone, active, onPress }) {
  const fg =
    tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.textMuted;
  const bg =
    tone === "danger" ? colors.dangerBg : tone === "success" ? colors.successBg : colors.cardAlt;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      // The selected chip inverts rather than merely gaining a border: at this
      // size a 1px outline is not a state change you notice across the room.
      style={[
        styles.tallyChip,
        { backgroundColor: active ? fg : bg, borderColor: fg },
        active && styles.tallyChipActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={`${value} ${label}. ${
        active ? "Sorted to the top. Tap to restore roll order" : "Tap to sort to the top"
      }`}
    >
      <Text style={[styles.tallyValue, { color: active ? colors.white : fg }]}>{value}</Text>
      <Text style={[styles.tallyLabel, { color: active ? colors.white : fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const StudentRow = React.memo(function StudentRow({ student, code, onInfo }) {
  const absent = code === "A";
  const elsewhere = code !== "A" && code !== "P";

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>
          {student.name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          Roll {student.roll} · {student.type === "D" ? "Day scholar" : "Residential"}
        </Text>
      </View>

      <StatusBadge code={code} />

      <TouchableOpacity
        onPress={onInfo}
        hitSlop={layout.hitSlop}
        activeOpacity={0.6}
        style={styles.infoBtn}
        accessibilityRole="button"
        accessibilityLabel={`About ${student.name}. Currently ${statusLabel(code)}`}
      >
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={absent || elsewhere ? colors.primary : colors.icon}
        />
      </TouchableOpacity>
    </View>
  );
});

function StatusBadge({ code }) {
  if (code === "P") {
    return (
      <View style={[styles.badge, styles.badgePresent]}>
        <Ionicons name="checkmark" size={13} color={colors.success} />
        <Text style={[styles.badgeText, { color: colors.success }]}>Present</Text>
      </View>
    );
  }
  if (code === "A") {
    return (
      <View style={[styles.badge, styles.badgeAbsent]}>
        <Text style={[styles.badgeText, { color: colors.white }]}>Absent</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeOther]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{statusLabel(code)}</Text>
    </View>
  );
}

/**
 * One student's whole day. The (i) exists because a status code alone does
 * not settle anything — "absent at breakfast but present at Mangalarati an
 * hour earlier" is the sort of thing a teacher rings a parent about, and it
 * is invisible while looking at a single checkpoint.
 */
function StudentInfoSheet({ student, day, entries, onClose }) {
  const [days, setDays] = useState(30);
  // Safe to call with a null student — the hook returns an empty record and
  // makes no request, so hook order stays identical whether the sheet is open
  // or closed.
  const history = useStudentHistory(student?.id, days);
  const absences = entries.filter((e) => e.code === "A").length;

  return (
    <BottomSheet
      visible={!!student}
      onClose={onClose}
      title={student?.name || ""}
      subtitle={
        student
          ? `Roll ${student.roll} · Class ${student.label} · ${
              student.type === "D" ? "Day scholar" : "Residential"
            }`
          : ""
      }
      showClose
    >
      {!!student && (
        <>
          {student.remedial && (
            <View style={styles.flag}>
              <Ionicons name="book-outline" size={14} color={colors.primary} />
              <Text style={styles.flagText}>On the remedial list</Text>
            </View>
          )}

          <View style={styles.infoHead}>
            <Text style={styles.infoHeadText}>{fmtDay(day)}</Text>
            {absences > 0 && (
              <Text style={styles.infoHeadWarn}>
                {plural(absences, "absence")} today
              </Text>
            )}
          </View>

          {entries.length === 0 ? (
            <Text style={styles.infoEmpty}>Nothing was submitted on this day.</Text>
          ) : (
            entries.map(({ duty, code }) => (
              <View key={duty.id} style={styles.infoRow}>
                <View style={styles.infoRowMain}>
                  <Text style={styles.infoCheckpoint} numberOfLines={1}>
                    {duty.checkpoint}
                  </Text>
                  <Text style={typography.caption}>{fmtTime(duty.start)}</Text>
                </View>
                {code === null ? (
                  <Text style={styles.infoNotIn}>Not in group</Text>
                ) : (
                  <StatusBadge code={code} />
                )}
              </View>
            ))
          )}

          {/* The day above answers "where was he this morning". This answers
              "is this a pattern", which is the question that actually decides
              whether anyone rings home. */}
          <View style={styles.histHead}>
            <Text style={typography.label}>Record</Text>
            <View style={styles.rangeRow}>
              {RANGES.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => setDays(r.key)}
                  activeOpacity={0.7}
                  style={[styles.rangeChip, days === r.key && styles.rangeChipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: days === r.key }}
                >
                  <Text style={[styles.rangeText, days === r.key && styles.rangeTextOn]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {history.loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : history.error ? (
            <Text style={styles.infoEmpty}>{history.error}</Text>
          ) : !history.summary || Number(history.summary.checkpoints) === 0 ? (
            <Text style={styles.infoEmpty}>No checkpoints recorded in this period.</Text>
          ) : (
            <>
              <View style={styles.histStrip}>
                <HistCell value={`${history.summary.pct_present}%`} label="present" />
                <HistCell value={history.summary.checkpoints} label="checkpoints" />
                <HistCell
                  value={history.summary.absent}
                  label="absent"
                  tone={Number(history.summary.absent) > 0 ? colors.danger : undefined}
                />
                <HistCell value={history.summary.elsewhere} label="elsewhere" />
              </View>

              {history.marks
                .filter((m) => !m.present)
                .slice(0, 8)
                .map((m, i) => (
                  <View key={`${m.day}-${m.checkpoint}-${i}`} style={styles.histRow}>
                    <Text style={styles.histDay}>{fmtDay(m.day)}</Text>
                    <Text style={styles.histCheckpoint} numberOfLines={1}>
                      {m.checkpoint}
                    </Text>
                    <Text
                      style={[
                        styles.histStatus,
                        m.status === "A" && { color: colors.danger },
                      ]}
                    >
                      {m.status_label}
                    </Text>
                  </View>
                ))}
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}

function HistCell({ value, label, tone }) {
  return (
    <View style={styles.histCell}>
      <Text style={[styles.histValue, !!tone && { color: tone }]}>{value}</Text>
      <Text style={styles.histLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },

  strip: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 4,
    marginTop: spacing.sm,
  },
  stripCell: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xs },
  stripDivider: { width: 1, backgroundColor: colors.borderStrong, marginVertical: spacing.xs },
  stripValue: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 26,
    color: colors.text,
    ...numeric,
  },
  stripLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },

  controls: {
    flexDirection: "row",
    // Stretch, so the divider spans the bar's full height rather than only
    // the height of the taller label.
    alignItems: "stretch",
    marginTop: spacing.md - 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    // Keeps the Android ripple inside the rounded edge instead of painting a
    // square over the corners.
    overflow: "hidden",
  },
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm - 3,
    minHeight: layout.touch,
    paddingHorizontal: spacing.md,
  },
  // Only the checkpoint half expands; the date half stays at its natural
  // width so a short "Today" never stretches into a wide empty segment.
  controlGrow: { flex: 1, minWidth: 0 },
  controlOff: { opacity: 0.5 },
  controlDivider: {
    width: 1,
    backgroundColor: colors.borderStrong,
    marginVertical: spacing.sm,
  },
  controlText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
    flexShrink: 1,
  },

  context: { marginTop: spacing.md - 4 },
  contextTitle: { ...typography.h3 },
  contextMeta: { ...typography.caption, marginTop: 1 },
  corrected: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    marginTop: spacing.xs,
  },
  correctedText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.warning,
  },

  // Reserved in the header so the layout does not jump when the field lifts
  // out of the flow to be positioned absolutely.
  searchSlot: { height: SEARCH_H, marginTop: spacing.sm },

  pinned: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 11,
    paddingHorizontal: layout.gutter,
  },
  pinBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    // Near-opaque, not translucent: rows passing underneath must not show
    // through the field they are sliding behind.
    backgroundColor: colors.bar,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },

  tallyChipActive: { borderWidth: 1 },

  tally: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm - 3, marginTop: spacing.sm },
  tallyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tallyValue: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, ...numeric },
  tallyLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: ROW_H,
    paddingHorizontal: layout.gutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowMain: { flex: 1, minWidth: 0 },
  name: { ...typography.bodyStrong, fontSize: 15 },
  infoBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  badgePresent: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success },
  badgeAbsent: { backgroundColor: colors.danger },
  badgeOther: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.borderStrong },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },

  flag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 3,
    backgroundColor: colors.infoBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm - 3,
    marginBottom: spacing.sm,
  },
  flagText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.primary },

  infoHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  infoHeadText: { ...typography.label },
  infoHeadWarn: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.danger },
  infoEmpty: { ...typography.caption, paddingVertical: spacing.md },

  printBtn: {
    width: layout.touch,
    height: layout.touch,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  exportBusy: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },

  histHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  rangeRow: { flexDirection: "row", gap: spacing.xs },
  rangeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  rangeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  rangeTextOn: { color: colors.white },

  histStrip: {
    flexDirection: "row",
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  histCell: { flex: 1, alignItems: "center" },
  histValue: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.text, ...numeric },
  histLabel: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 13, color: colors.textMuted },

  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  histDay: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textMuted, width: 96 },
  histCheckpoint: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.text },
  histStatus: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.textMuted },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  infoRowMain: { flex: 1, minWidth: 0 },
  infoCheckpoint: { ...typography.bodyStrong },
  infoNotIn: { ...typography.caption, fontSize: 12 },

  centered: { alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingTop: spacing.xl },
  centeredText: { ...typography.caption, fontSize: 13, textAlign: "center" },
});
