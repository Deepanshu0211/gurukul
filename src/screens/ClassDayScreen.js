import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, layout, typography, numeric } from "../theme/theme";
import { useTabContentInset, useScreenTopInset } from "../navigation/tabBarInset";
import ScreenHeader from "../components/ScreenHeader";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import { EmptyState } from "../components/ui";
import { fmtTime, fmtDay, fmtDayChip, plural, todayISO } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { useDayAttendance, useDutyDays } from "../lib/history";

/**
 * SRS A8 — a class teacher sees their OWN students across every checkpoint
 * marked on a given day, by any duty teacher, to cross-check and follow up.
 *
 * Today is the default, but the date strip lets a teacher read back through
 * earlier days: "was he at dinner on Tuesday?" is the question that actually
 * gets asked when a child's attendance is being discussed with a parent.
 *
 * This is a dense table, not a list of cards: the whole value is seeing a
 * class of 25-30 in one or two screenfuls. Row height is kept tight for that
 * reason — spacing that suits a card list makes this view useless.
 */

const ROW_H = 46;
// Fixed so the fade below can be positioned without a second measurement:
// the column headings sit between the page header and the scrolling rows.
const HEAD_ROW_H = 34;
// Columns size themselves to the screen. With only two checkpoints marked a
// fixed width leaves a dead strip down the right-hand side; with all ten it
// has to scroll. These bounds cover both.
const MIN_CELL_W = 52;
const MAX_CELL_W = 86;
const MIN_NAME_W = 132;

/** Column widths that fill the screen when they can, and scroll when they can't. */
function useColumnWidths(screenWidth, count) {
  return useMemo(() => {
    // Both the header row and the body rows are indented by one gutter, so the
    // table's left edge lines up with every other screen's content.
    const pad = layout.gutter;
    if (!count) return { cellW: MIN_CELL_W, nameW: MIN_NAME_W, totalW: screenWidth };
    const forCells = screenWidth - pad - MIN_NAME_W;
    const cellW = Math.max(MIN_CELL_W, Math.min(MAX_CELL_W, forCells / count));
    // Any width the cells don't need goes to the name column, so long names
    // get more room rather than the table leaving a gap.
    const nameW = Math.max(MIN_NAME_W, screenWidth - pad - cellW * count);
    return { cellW, nameW, totalW: pad + nameW + cellW * count };
  }, [screenWidth, count]);
}

/** "Breakfast prasadam" -> "BFAST". Full names never fit a 54px column. */
const SHORT = {
  Mangalarati: "MANG",
  "Breakfast prasadam": "BFAST",
  "Morning attendance": "MORN",
  "Morning self study": "M.STUDY",
  "Lunch prasadam": "LUNCH",
  "Evening sports": "SPORTS",
  "Remedial class": "REMED",
  "Evening self study": "E.STUDY",
  "Dinner prasadam": "DINNER",
  "Night attendance": "NIGHT",
};
const shortLabel = (name) => SHORT[name] || (name || "").slice(0, 5).toUpperCase();

export default function ClassDayScreen() {
  const { user } = useAuth();
  const {
    students,
    duties: liveDuties,
    records: liveRecords,
    studentsForDuty,
    refresh,
  } = useSchoolData();
  const { width: screenWidth } = useWindowDimensions();
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll } = useScrolled();
  // Where the table starts, so the fade lands on its top edge.
  const [headerH, setHeaderH] = useState(190);

  // The day the app is currently working on. Usually today, but the duty
  // generator does not run yet, so the live set can be the most recent day
  // that has duties — read it from the data rather than assuming.
  const liveDay = liveDuties[0]?.day || todayISO();
  // null means "the live day", so the default view needs no fetch at all.
  const [selectedDay, setSelectedDay] = useState(null);
  const isPast = !!selectedDay && selectedDay !== liveDay;

  const { days } = useDutyDays();
  const past = useDayAttendance(isPast ? selectedDay : null);

  const duties = isPast ? past.duties : liveDuties;
  const records = isPast ? past.records : liveRecords;
  const day = selectedDay || liveDay;

  useFocusEffect(
    useCallback(() => {
      if (!isPast) refresh();
    }, [refresh, isPast])
  );

  const classKey = user?.classKey;
  const myStudents = useMemo(
    () => students.filter((s) => s.key === classKey),
    [students, classKey]
  );

  // Only submitted checkpoints have anything to show. A duty has a record
  // exactly when it was submitted, which holds for any day — no clock needed.
  const submitted = useMemo(
    () => duties.filter((d) => records[d.id]).sort((a, b) => a.start - b.start),
    [duties, records]
  );

  // Precompute each duty's member set once, rather than scanning the group
  // for every student × checkpoint cell.
  const memberSets = useMemo(
    () => new Map(submitted.map((d) => [d.id, new Set(studentsForDuty(d).map((s) => s.id))])),
    [submitted, studentsForDuty]
  );

  const statusFor = useCallback(
    (student, duty) => {
      if (!memberSets.get(duty.id)?.has(student.id)) return "-";
      return records[duty.id]?.statuses[student.id] || "P";
    },
    [memberSets, records]
  );

  const needsFollowUp = useMemo(
    () => myStudents.filter((s) => submitted.some((d) => statusFor(s, d) === "A")),
    [myStudents, submitted, statusFor]
  );

  const { cellW, nameW, totalW } = useColumnWidths(screenWidth, submitted.length);

  const dayOptions = days.length ? days : [liveDay];

  if (!classKey) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <EmptyState
          icon="people-outline"
          title="No class assigned"
          body="This view is for class teachers tracking their own students through the day."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View
        style={[styles.header, { paddingTop: topInset }]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setHeaderH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
        }}
      >
        <ScreenHeader
          eyebrow="My class"
          title={user.classLabel}
          subtitle={`${fmtDay(day)} · ${plural(myStudents.length, "student")} · ${
            submitted.length
          } checkpoint${submitted.length === 1 ? "" : "s"} marked`}
        />

        <DayStrip
          days={dayOptions}
          selected={day}
          liveDay={liveDay}
          onSelect={(d) => setSelectedDay(d === liveDay ? null : d)}
        />

        {needsFollowUp.length > 0 && (
          <View style={styles.followUp}>
            <Ionicons name="warning" size={14} color={colors.danger} />
            <Text style={styles.followUpText} numberOfLines={2}>
              <Text style={styles.followUpStrong}>
                {plural(needsFollowUp.length, "student")} {isPast ? "were" : "was"} absent
              </Text>
              {" — "}
              {needsFollowUp.map((s) => s.name.split(" ")[0]).join(", ")}
            </Text>
          </View>
        )}

        {/* The key sits above the table, not pinned under it: as a fixed footer
            it was permanently hidden behind the floating tab bar. */}
        <View style={styles.legend}>
          <LegendItem code="P" label="Present" />
          <LegendItem code="A" label="Absent" />
          <LegendItem code="H" label="Elsewhere" />
          <LegendItem code="-" label="Not in group" />
        </View>
      </View>

      {past.loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centeredText}>Loading {fmtDay(day)}…</Text>
        </View>
      ) : past.error ? (
        <EmptyState icon="cloud-offline-outline" title="Can't load that day" body={past.error} />
      ) : submitted.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title={isPast ? "Nothing was marked" : "Nothing marked yet"}
          body={
            isPast
              ? "No checkpoint was submitted on this day."
              : "Statuses appear here as duty teachers submit each checkpoint."
          }
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          // Only scrolls when the table is genuinely wider than the screen.
          scrollEnabled={totalW > screenWidth}
        >
          <View style={{ width: Math.max(totalW, screenWidth) }}>
            <View style={styles.headRow}>
              <View style={{ width: nameW, paddingRight: spacing.sm }}>
                <Text style={styles.colLabel}>STUDENT</Text>
              </View>
              {submitted.map((d) => (
                <View key={d.id} style={[styles.cell, { width: cellW }]}>
                  <Text style={styles.colLabel} numberOfLines={1}>
                    {shortLabel(d.checkpoint)}
                  </Text>
                  <Text style={styles.colTime}>{fmtTime(d.start)}</Text>
                </View>
              ))}
            </View>

            <FlatList
              data={myStudents}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingBottom: tabInset }}
              showsVerticalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              // Fixed row height lets the list skip measurement, which keeps
              // a 30-row table smooth on a low-end phone.
              getItemLayout={(_, index) => ({
                length: ROW_H,
                offset: ROW_H * index,
                index,
              })}
              renderItem={({ item, index }) => (
                <View style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
                  <View style={{ width: nameW, paddingRight: spacing.sm }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  {submitted.map((d) => (
                    <View key={d.id} style={[styles.cell, { width: cellW }]}>
                      <StatusDot code={statusFor(item, d)} />
                    </View>
                  ))}
                </View>
              )}
            />
          </View>
        </ScrollView>
      )}

      {/* Sits below the column headings, so student rows dissolve into the
          header block instead of being sliced through. */}
      {submitted.length > 0 && (
        <EdgeFade top={headerH + HEAD_ROW_H} height={22} visible={scrolled} />
      )}
    </SafeAreaView>
  );
}

/**
 * Newest day first, scrolled to the left edge — the common case is "today" or
 * "the last day or two", not a calendar hunt. A full date picker was the
 * alternative and it costs two taps to reach yesterday.
 */
function DayStrip({ days, selected, liveDay, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {days.map((d) => {
        const active = d === selected;
        const chip = fmtDayChip(d);
        return (
          <TouchableOpacity
            key={d}
            onPress={() => onSelect(d)}
            activeOpacity={0.7}
            style={[styles.dayChip, active && styles.dayChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show ${fmtDay(d)}`}
          >
            <Text style={[styles.dayChipTop, active && styles.dayChipTextActive]}>
              {d === liveDay && chip.top !== "TODAY" ? "LATEST" : chip.top}
            </Text>
            <Text style={[styles.dayChipBottom, active && styles.dayChipTextActive]}>
              {chip.bottom}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const DOT_LABEL = { P: "Present", A: "Absent", "-": "Not in this group" };

function StatusDot({ code }) {
  if (code === "-") {
    return (
      <Text style={styles.dash} accessibilityLabel={DOT_LABEL["-"]}>
        –
      </Text>
    );
  }
  if (code === "P") {
    return (
      <View style={[styles.dot, styles.dotPresent]} accessibilityLabel={DOT_LABEL.P}>
        <Ionicons name="checkmark" size={12} color={colors.success} />
      </View>
    );
  }
  if (code === "A") {
    return (
      <View style={[styles.dot, styles.dotAbsent]} accessibilityLabel={DOT_LABEL.A}>
        <Text style={styles.dotAbsentText}>A</Text>
      </View>
    );
  }
  return (
    <View style={[styles.dot, styles.dotOther]}>
      <Text style={styles.dotOtherText}>{code}</Text>
    </View>
  );
}

function LegendItem({ code, label }) {
  return (
    <View style={styles.legendItem}>
      <StatusDot code={code} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },

  // Bleeds to both screen edges so the strip reads as scrollable, while the
  // first chip still starts on the page's shared left edge.
  strip: { gap: spacing.sm, paddingVertical: spacing.sm - 2, paddingRight: spacing.md },
  dayChip: {
    minWidth: 62,
    minHeight: layout.touch,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipTop: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  dayChipBottom: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text,
    ...numeric,
  },
  dayChipTextActive: { color: colors.white },

  followUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 2,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  followUpText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
  },
  followUpStrong: { fontFamily: fonts.bold },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md - 4,
    marginTop: spacing.md - 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 1 },
  legendText: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },

  headRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: HEAD_ROW_H,
    paddingLeft: layout.gutter,
    paddingBottom: spacing.sm - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: layout.gutter,
    height: ROW_H,
  },
  // Zebra striping instead of borders — at this density, a line under every
  // row turns the table into a grid of noise.
  rowAlt: { backgroundColor: colors.cardAlt },

  cell: { alignItems: "center" },
  colLabel: { ...typography.label, fontSize: 10, letterSpacing: 0.6 },
  // Was `colors.border`, which put near-white text on a near-white ground.
  colTime: {
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 13,
    color: colors.icon,
    marginTop: 1,
    ...numeric,
  },
  name: { ...typography.body, fontFamily: fonts.medium },

  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dotPresent: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success },
  dotAbsent: { backgroundColor: colors.danger },
  dotOther: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  dotAbsentText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: colors.white },
  dotOtherText: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13, color: colors.text },
  dash: { fontFamily: fonts.regular, fontSize: 14, color: colors.icon },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  centeredText: { ...typography.caption, fontSize: 13, textAlign: "center" },
});
