import React from "react";
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import {
  DUTIES,
  NOW,
  fmtTime,
  dutyStatus,
  studentsForDuty,
  escalationStage,
} from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "closes in 8 min" beats "7:30 AM – 7:50 AM" when the question is
// "do I have time?" — so the countdown is what gets prominence.
const countdown = (duty, status) => {
  if (status === "overdue") {
    const late = NOW - duty.end;
    return late < 60 ? `Overdue by ${late} min` : `Overdue by ${Math.floor(late / 60)}h`;
  }
  const left = duty.end - NOW;
  if (left <= 60) return `Closes in ${left} min`;
  return `Closes ${fmtTime(duty.end)}`;
};

export default function DutiesScreen({ navigation }) {
  const { user } = useAuth();
  const { records } = useAttendance();

  const isTeacher = user.role === "teacher";
  const duties = isTeacher ? DUTIES.filter((d) => d.staffId === user.id) : DUTIES;

  const withStatus = duties.map((d) => ({ ...d, _status: dutyStatus(d, records) }));

  // Overdue first inside the urgent group — the most at-risk duty leads.
  const urgent = withStatus
    .filter((d) => d._status === "overdue" || d._status === "due")
    .sort((a, b) => (a._status === "overdue" ? -1 : 1) - (b._status === "overdue" ? -1 : 1));
  const later = withStatus.filter((d) => d._status === "upcoming").sort((a, b) => a.start - b.start);
  const done = withStatus.filter((d) => d._status === "done").sort((a, b) => a.start - b.start);

  const sections = [
    { key: "urgent", title: "Needs attention", data: urgent },
    { key: "later", title: "Later today", data: later },
    { key: "done", title: "Submitted", data: done },
  ].filter((s) => s.data.length > 0);

  const openDuty = (id) => navigation.navigate("DutyMarking", { dutyId: id });

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <Header
            user={user}
            scopeNote={isTeacher ? "Your duties today" : "All duties today"}
            done={done.length}
            total={duties.length}
            urgentCount={urgent.length}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nothing assigned today</Text>
            <Text style={styles.emptyBody}>
              Duties appear here as the coordinator assigns them.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={typography.label}>{section.title.toUpperCase()}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, section }) => {
          const count = studentsForDuty(item).length;
          if (section.key === "urgent") {
            return <UrgentCard duty={item} count={count} onPress={() => openDuty(item.id)} />;
          }
          if (section.key === "later") {
            return <LaterRow duty={item} count={count} onPress={() => openDuty(item.id)} />;
          }
          return (
            <DoneRow
              duty={item}
              count={count}
              record={records[item.id]}
              onPress={() => openDuty(item.id)}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

function Header({ user, scopeNote, done, total, urgentCount }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  // Names carry honorifics (Mt = Mataji, Pr = Prabhu); the given name alone
  // is what a greeting should use.
  const firstName = (user.name || "").split(" ")[0];
  const allDone = total > 0 && done === total;

  return (
    <View style={styles.header}>
      <Text style={styles.greetLabel}>RADHE RADHE</Text>
      <Text style={styles.greetName}>{firstName}</Text>
      <Text style={typography.caption}>
        {scopeNote} · Friday, {fmtTime(NOW)}
      </Text>

      <View style={styles.progressBlock}>
        <View style={styles.progressTop}>
          <Text style={styles.progressCount}>
            {done}
            <Text style={styles.progressOf}> of {total} submitted</Text>
          </Text>
          {urgentCount > 0 ? (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentBadgeText}>
                {urgentCount} pending
              </Text>
            </View>
          ) : allDone ? (
            <View style={styles.clearBadge}>
              <Ionicons name="checkmark" size={11} color={colors.success} />
              <Text style={styles.clearBadgeText}>All clear</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

// Actionable duties get the most visual weight on the screen: full card,
// countdown, escalation state, and a real button.
function UrgentCard({ duty, count, onPress }) {
  const overdue = duty._status === "overdue";
  const esc = escalationStage(duty);

  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{duty.checkpoint}</Text>
          <Text style={typography.caption}>
            {duty.group} · {plural(count, "student")}
          </Text>
        </View>
        <View style={[styles.timePill, overdue ? styles.timePillOverdue : styles.timePillDue]}>
          <Ionicons
            name={overdue ? "alert-circle" : "time-outline"}
            size={12}
            color={overdue ? colors.danger : colors.warning}
          />
          <Text style={[styles.timePillText, { color: overdue ? colors.danger : colors.warning }]}>
            {countdown(duty, duty._status)}
          </Text>
        </View>
      </View>

      {esc && (
        <View style={styles.escRow}>
          <Ionicons name="megaphone-outline" size={13} color={colors.textMuted} />
          <Text style={styles.escText}>{esc.text}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.markBtn} onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.markBtnText}>Mark attendance</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

// Nothing to do yet — so this is a quiet single line, led by its time.
function LaterRow({ duty, count, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <Text style={styles.rowTime}>{fmtTime(duty.start)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{duty.checkpoint}</Text>
        <Text style={typography.caption}>
          {duty.group} · {plural(count, "student")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

// Done and dusted — collapses to one line, but still shows the counts the
// spec asks for (A2) and stays tappable for the read-only cross-check (A7).
function DoneRow({ duty, count, record, onPress }) {
  const absent = record ? Object.values(record.statuses).filter((s) => s === "A").length : 0;
  const marked = record ? Object.keys(record.statuses).length : 0;
  const present = count - marked;

  return (
    <TouchableOpacity style={[styles.row, styles.rowDone]} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.check}>
        <Ionicons name="checkmark" size={13} color={colors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitleDone}>{duty.checkpoint}</Text>
        <Text style={typography.caption}>
          {present}/{count} present
          {absent > 0 && <Text style={{ color: colors.danger }}> · {absent} absent</Text>}
          {record ? ` · ${fmtTime(record.at)}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Generous bottom padding so the last card clears the tab bar instead of
  // sitting flush against it.
  content: { paddingHorizontal: spacing.md, paddingBottom: 48 },

  header: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  greetLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    color: colors.textMuted,
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  greetName: {
    fontFamily: fonts.bold,
    fontSize: 30,
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 3,
  },

  progressBlock: { marginTop: spacing.md },
  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressCount: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  progressOf: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  urgentBadge: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgentBadgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.warning },
  clearBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.successBg,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clearBadgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.success },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.cardAlt, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.success, borderRadius: 2 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 11, color: colors.border },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardOverdue: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.text, marginBottom: 2 },

  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  timePillDue: { backgroundColor: colors.warningBg },
  timePillOverdue: { backgroundColor: colors.white },
  timePillText: { fontFamily: fonts.bold, fontSize: 11.5 },

  escRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  escText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },

  markBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  markBtnText: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.white },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowDone: { backgroundColor: colors.cardAlt, borderColor: "transparent" },
  rowTime: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    width: 62,
    fontVariant: ["tabular-nums"],
  },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginBottom: 1 },
  rowTitleDone: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.textMuted, marginBottom: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { alignItems: "center", paddingVertical: 64, gap: 6 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: 4 },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
});
