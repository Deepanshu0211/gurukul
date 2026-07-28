import React, { useMemo } from "react";
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import ProgressBar from "../components/ProgressBar";
import { DUTIES, NOW, studentsForDuty } from "../data/mockData";
import { DUTY_STATUS, groupDuties, escalationStage, summarise } from "../domain/duties";
import { plural, fmtTime, fmtDuration, givenName } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

const SECTIONS = {
  URGENT: "urgent",
  LATER: "later",
  DONE: "done",
};

export default function DutiesScreen({ navigation }) {
  const { user } = useAuth();
  const { records } = useAttendance();

  const isTeacher = user?.role === "teacher";

  const duties = useMemo(
    () => (isTeacher ? DUTIES.filter((d) => d.staffId === user.id) : DUTIES),
    [isTeacher, user?.id]
  );

  const { urgent, later, done } = useMemo(
    () => groupDuties(duties, records, NOW),
    [duties, records]
  );

  const sections = useMemo(
    () =>
      [
        { key: SECTIONS.URGENT, title: "Needs attention", data: urgent },
        { key: SECTIONS.LATER, title: "Later today", data: later },
        { key: SECTIONS.DONE, title: "Submitted", data: done },
      ].filter((s) => s.data.length > 0),
    [urgent, later, done]
  );

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
          <DutiesHeader
            user={user}
            scopeNote={isTeacher ? "Your duties today" : "All duties today"}
            done={done.length}
            total={duties.length}
            pending={urgent.length}
          />
        }
        ListEmptyComponent={<EmptyState />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={typography.label}>{section.title.toUpperCase()}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, section }) => {
          const count = studentsForDuty(item).length;
          const onPress = () => openDuty(item.id);

          if (section.key === SECTIONS.URGENT) {
            return <UrgentCard duty={item} count={count} onPress={onPress} />;
          }
          if (section.key === SECTIONS.LATER) {
            return <LaterRow duty={item} count={count} onPress={onPress} />;
          }
          return (
            <DoneRow duty={item} count={count} record={records[item.id]} onPress={onPress} />
          );
        }}
      />
    </SafeAreaView>
  );
}

function DutiesHeader({ user, scopeNote, done, total, pending }) {
  const allDone = total > 0 && done === total;

  return (
    <ScreenHeader
      eyebrow="RADHE RADHE"
      title={givenName(user?.name)}
      subtitle={`${scopeNote} · Friday, ${fmtTime(NOW)}`}
      right={
        pending > 0 ? (
          <Badge tone="warning" text={`${pending} pending`} />
        ) : allDone ? (
          <Badge tone="success" text="All clear" icon="checkmark" />
        ) : null
      }
    >
      {total > 0 && (
        <View style={styles.progressBlock}>
          <ProgressBar done={done} total={total} />
          <Text style={styles.progressText}>
            <Text style={styles.progressCount}>{done}</Text> of {total} submitted
          </Text>
        </View>
      )}
    </ScreenHeader>
  );
}

function Badge({ tone, text, icon }) {
  const toneStyle = tone === "success" ? styles.badgeSuccess : styles.badgeWarning;
  const textStyle = tone === "success" ? styles.badgeTextSuccess : styles.badgeTextWarning;
  return (
    <View style={[styles.badge, toneStyle]}>
      {!!icon && (
        <Ionicons
          name={icon}
          size={11}
          color={tone === "success" ? colors.success : colors.warning}
        />
      )}
      <Text style={[styles.badgeText, textStyle]}>{text}</Text>
    </View>
  );
}

/** Actionable duties carry the most visual weight: countdown, escalation
 *  state, and a real button. Everything else on the screen is quieter. */
function UrgentCard({ duty, count, onPress }) {
  const overdue = duty.status === DUTY_STATUS.OVERDUE;
  const esc = escalationStage(duty, NOW);
  const countdownText = overdue
    ? `Overdue by ${fmtDuration(NOW - duty.end)}`
    : `Closes in ${fmtDuration(duty.end - NOW)}`;

  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleCol}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {duty.checkpoint}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
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
            {countdownText}
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

/** Nothing to do yet — a quiet row, led by its time. */
function LaterRow({ duty, count, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <Text style={styles.rowTime}>{fmtTime(duty.start)}</Text>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {duty.checkpoint}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {duty.group} · {plural(count, "student")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

/** Done — collapses to one line but keeps the counts the spec asks for (A2),
 *  and stays tappable for the read-only cross-check (A7). */
function DoneRow({ duty, count, record, onPress }) {
  const { present, absent } = summarise(count, record?.statuses);

  return (
    <TouchableOpacity style={[styles.row, styles.rowDone]} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.check}>
        <Ionicons name="checkmark" size={13} color={colors.success} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitleDone} numberOfLines={1}>
          {duty.checkpoint}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {present}/{count} present
          {absent > 0 && <Text style={{ color: colors.danger }}> · {absent} absent</Text>}
          {record?.at != null ? ` · ${fmtTime(record.at)}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Ionicons name="checkmark-done-outline" size={30} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>Nothing assigned today</Text>
      <Text style={styles.emptyBody}>Duties appear here as the coordinator assigns them.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.md, paddingBottom: 44 },

  progressBlock: { marginTop: spacing.md },
  progressText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 6 },
  progressCount: { fontFamily: fonts.bold, color: colors.text },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeWarning: { backgroundColor: colors.warningBg },
  badgeSuccess: { backgroundColor: colors.successBg },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11 },
  badgeTextWarning: { color: colors.warning },
  badgeTextSuccess: { color: colors.success },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 11, color: colors.border },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 8,
  },
  cardOverdue: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitleCol: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, marginBottom: 2 },

  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  timePillDue: { backgroundColor: colors.warningBg },
  timePillOverdue: { backgroundColor: colors.white },
  timePillText: { fontFamily: fonts.bold, fontSize: 11 },

  escRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  escText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },

  markBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: spacing.sm + 2,
  },
  markBtnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 7,
  },
  rowDone: { backgroundColor: colors.cardAlt, borderColor: "transparent" },
  rowMain: { flex: 1, minWidth: 0 },
  rowTime: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    width: 60,
    fontVariant: ["tabular-nums"],
  },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text, marginBottom: 1 },
  rowTitleDone: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, marginBottom: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { alignItems: "center", paddingVertical: 56, gap: 6 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, marginTop: 4 },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
});
