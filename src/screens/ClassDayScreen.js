import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts } from "../theme/theme";
import { TAB_CONTENT_INSET } from "../navigation/tabBarInset";
import { NOW } from "../data/mockData";
import { dutyStatus, DUTY_STATUS } from "../domain/duties";
import { fmtTime, plural } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";

/**
 * SRS A8 — a class teacher sees their OWN students across every checkpoint
 * marked so far today, by any duty teacher, to cross-check and follow up.
 *
 * This is a dense table, not a list of cards: the whole value is seeing a
 * class of 25-30 in one or two screenfuls. Row height is kept tight for that
 * reason — spacing that suits a card list makes this view useless.
 */

const ROW_H = 46;
// Columns size themselves to the screen. With only two checkpoints marked a
// fixed width leaves a dead strip down the right-hand side; with all ten it
// has to scroll. These bounds cover both.
const MIN_CELL_W = 52;
const MAX_CELL_W = 86;
const MIN_NAME_W = 132;

/** Column widths that fill the screen when they can, and scroll when they can't. */
function useColumnWidths(screenWidth, count) {
  return useMemo(() => {
    const pad = spacing.md;
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
  const { students, duties, records, studentsForDuty, refresh } = useSchoolData();
  const { width: screenWidth } = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const classKey = user?.classKey;
  const myStudents = useMemo(
    () => students.filter((s) => s.key === classKey),
    [students, classKey]
  );

  // Only submitted checkpoints have anything to show.
  const submitted = useMemo(
    () =>
      duties
        .filter((d) => dutyStatus(d, records, NOW) === DUTY_STATUS.DONE)
        .sort((a, b) => a.start - b.start),
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

  if (!classKey) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <Empty
          icon="people-outline"
          title="No class assigned"
          body="This view is for class teachers tracking their own students through the day."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{user.classLabel}</Text>
          <Text style={styles.meta}>
            {plural(myStudents.length, "student")} · {submitted.length} marked
          </Text>
        </View>

        {needsFollowUp.length > 0 && (
          <View style={styles.followUp}>
            <Ionicons name="warning" size={13} color={colors.danger} />
            <Text style={styles.followUpText} numberOfLines={2}>
              <Text style={styles.followUpStrong}>
                {plural(needsFollowUp.length, "student")} absent
              </Text>
              {" — "}
              {needsFollowUp.map((s) => s.name.split(" ")[0]).join(", ")}
            </Text>
          </View>
        )}
      </View>

      {submitted.length === 0 ? (
        <Empty
          icon="time-outline"
          title="Nothing marked yet"
          body="Statuses appear here as duty teachers submit each checkpoint."
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
                  <Text style={styles.colLabel}>{shortLabel(d.checkpoint)}</Text>
                  <Text style={styles.colTime}>{fmtTime(d.start)}</Text>
                </View>
              ))}
            </View>

            <FlatList
              data={myStudents}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingBottom: TAB_CONTENT_INSET }}
              showsVerticalScrollIndicator={false}
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

      <View style={styles.legend}>
        <LegendItem code="P" label="Present" />
        <LegendItem code="A" label="Absent" />
        <LegendItem code="H" label="Elsewhere" />
        <LegendItem code="-" label="Not in group" />
      </View>
    </SafeAreaView>
  );
}

function StatusDot({ code }) {
  if (code === "-") return <Text style={styles.dash}>–</Text>;
  if (code === "P") {
    return (
      <View style={[styles.dot, styles.dotPresent]}>
        <Ionicons name="checkmark" size={11} color={colors.success} />
      </View>
    );
  }
  if (code === "A") {
    return (
      <View style={[styles.dot, styles.dotAbsent]}>
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

function Empty({ icon, title, body }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={26} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { fontFamily: fonts.bold, fontSize: 21, color: colors.text, letterSpacing: -0.3 },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },

  followUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    marginTop: 8,
  },
  followUpText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.danger, lineHeight: 16 },
  followUpStrong: { fontFamily: fonts.bold },

  headRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: spacing.md,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
    height: ROW_H,
  },
  // Zebra striping instead of borders — at this density, a line under every
  // row turns the table into a grid of noise.
  rowAlt: { backgroundColor: "rgba(238, 244, 250, 0.65)" },

  cell: { alignItems: "center" },
  colLabel: { fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.6, color: colors.textMuted },
  colTime: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.border,
    marginTop: 1,
    fontVariant: ["tabular-nums"],
  },
  name: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text },

  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dotPresent: { backgroundColor: colors.successBg },
  dotAbsent: { backgroundColor: colors.danger },
  dotOther: { backgroundColor: colors.border },
  dotAbsentText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white },
  dotOtherText: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.textMuted },
  dash: { fontFamily: fonts.regular, fontSize: 13, color: colors.border },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1.5,
    borderTopColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(255, 255, 255, 0.82)",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: spacing.xl },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginTop: 4 },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 250,
    lineHeight: 17,
  },
});
