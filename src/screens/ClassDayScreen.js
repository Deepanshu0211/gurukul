import React from "react";
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import { TAB_CONTENT_INSET } from "../navigation/tabBarInset";
import { DUTIES, STUDENTS, STATUS_META, NOW, studentsForDuty } from "../data/mockData";
import { dutyStatus, DUTY_STATUS } from "../domain/duties";
import { fmtTime } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

// SRS A8 — a class teacher can see their OWN students' status across every
// checkpoint marked so far today, by any duty teacher, to cross-check and
// follow up. Visibility is limited to their own class.
export default function ClassDayScreen({ navigation }) {
  const { user } = useAuth();
  const { records } = useAttendance();

  const classKey = user.classKey;
  const myStudents = STUDENTS.filter((s) => s.key === classKey);

  // Only checkpoints already submitted have anything to show.
  const submitted = DUTIES.filter((d) => dutyStatus(d, records, NOW) === DUTY_STATUS.DONE).sort(
    (a, b) => a.start - b.start
  );

  const statusFor = (student, duty) => {
    const inGroup = studentsForDuty(duty).some((s) => s.id === student.id);
    if (!inGroup) return "-";
    const code = records[duty.id]?.statuses[student.id];
    return code || "P";
  };

  // A student needing follow-up is one who was absent at any checkpoint.
  const needsFollowUp = myStudents.filter((s) =>
    submitted.some((d) => statusFor(s, d) === "A")
  );

  if (!classKey) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No class assigned</Text>
          <Text style={styles.emptyBody}>
            This view is for class teachers to track their own students through the day.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{user.classLabel}</Text>
        <Text style={typography.caption}>
          {myStudents.length} students · {submitted.length} checkpoint
          {submitted.length === 1 ? "" : "s"} marked so far
        </Text>
      </View>

      {needsFollowUp.length > 0 && (
        <View style={styles.followUp}>
          <Ionicons name="warning" size={16} color={colors.danger} />
          <Text style={styles.followUpText}>
            {needsFollowUp.length} student{needsFollowUp.length === 1 ? "" : "s"} marked absent
            today — {needsFollowUp.map((s) => s.name.split(" ")[0]).join(", ")}
          </Text>
        </View>
      )}

      {submitted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nothing marked yet</Text>
          <Text style={styles.emptyBody}>
            Your students' statuses appear here as duty teachers submit each checkpoint.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.gridHeader}>
              <View style={styles.nameCol}>
                <Text style={styles.colLabel}>STUDENT</Text>
              </View>
              {submitted.map((d) => (
                <View key={d.id} style={styles.cell}>
                  <Text style={styles.colLabel} numberOfLines={1}>
                    {d.checkpoint.split(" ")[0].toUpperCase()}
                  </Text>
                  <Text style={styles.colTime}>{fmtTime(d.start)}</Text>
                </View>
              ))}
            </View>

            <FlatList
              data={myStudents}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingBottom: TAB_CONTENT_INSET }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.gridRow}>
                  <View style={styles.nameCol}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.studentMeta}>Roll {item.roll}</Text>
                  </View>
                  {submitted.map((d) => {
                    const code = statusFor(item, d);
                    return (
                      <View key={d.id} style={styles.cell}>
                        <StatusDot code={code} />
                      </View>
                    );
                  })}
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
        <Ionicons name="checkmark" size={12} color={colors.success} />
      </View>
    );
  }
  if (code === "A") {
    return (
      <View style={[styles.dot, styles.dotAbsent]}>
        <Text style={styles.dotTextAbsent}>A</Text>
      </View>
    );
  }
  return (
    <View style={[styles.dot, styles.dotOther]}>
      <Text style={styles.dotTextOther}>{code}</Text>
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

const CELL_W = 62;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  pageTitle: { fontFamily: fonts.bold, fontSize: 26, color: colors.text, letterSpacing: -0.4 },

  followUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerBg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
  },
  followUpText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.danger, flex: 1, lineHeight: 17 },

  gridHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: spacing.md,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nameCol: { width: 132, paddingRight: spacing.sm },
  cell: { width: CELL_W, alignItems: "center" },
  colLabel: { fontFamily: fonts.semibold, fontSize: 9.5, letterSpacing: 0.8, color: colors.textMuted },
  colTime: {
    fontFamily: fonts.regular,
    fontSize: 9.5,
    color: colors.border,
    marginTop: 1,
    fontVariant: ["tabular-nums"],
  },
  studentName: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  studentMeta: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.textMuted },

  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dotPresent: { backgroundColor: colors.successBg },
  dotAbsent: { backgroundColor: colors.danger },
  dotOther: { backgroundColor: colors.cardAlt },
  dotTextAbsent: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  dotTextOther: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.textMuted },
  dash: { fontFamily: fonts.regular, fontSize: 14, color: colors.border },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: spacing.xl },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, marginTop: 4 },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 18,
  },
});
