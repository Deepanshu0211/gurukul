import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import { TAB_CONTENT_INSET } from "../navigation/tabBarInset";
import GreetingHeader from "../components/GreetingHeader";
import { NOW } from "../data/mockData";
import { DUTY_STATUS, groupDuties, escalationStage, summarise } from "../domain/duties";
import { plural, fmtTime, fmtDuration } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";

const SECTIONS = {
  URGENT: "urgent",
  LATER: "later",
  DONE: "done",
};

export default function DutiesScreen({ navigation }) {
  const { user } = useAuth();
  const { duties: allDuties, records, loading, error, refresh, studentsForDuty } = useSchoolData();
  const [refreshing, setRefreshing] = useState(false);

  // Reload on focus so a coordinator's reassignment shows up when a teacher
  // returns to this tab, rather than only after an app restart.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const isTeacher = user?.role === "teacher";

  const duties = useMemo(
    () => (isTeacher ? allDuties.filter((d) => d.staffId === user.id) : allDuties),
    [isTeacher, allDuties, user?.id]
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

  if (loading && duties.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={["top", "left", "right"]}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.centeredText}>Loading today's duties…</Text>
      </SafeAreaView>
    );
  }

  if (error && duties.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={["top", "left", "right"]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.textMuted} />
        <Text style={styles.centeredText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={refresh} activeOpacity={0.8}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

  const badge =
    pending > 0
      ? { text: `${pending} pending`, tone: "warning" }
      : allDone
      ? { text: "All clear", tone: "success", icon: "checkmark" }
      : null;

  return (
    <GreetingHeader
      user={user}
      meta={`${scopeNote} · Friday, ${fmtTime(NOW)}`}
      done={done}
      total={total}
      badge={badge}
    />
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
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: TAB_CONTENT_INSET },



  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 11, color: colors.border },

  card: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  cardOverdue: { borderColor: colors.danger, backgroundColor: "rgba(254, 242, 242, 0.88)" },
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
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  markBtnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    borderTopColor: "rgba(255, 255, 255, 0.95)",
    borderBottomColor: "rgba(255, 255, 255, 0.45)",
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  rowDone: { backgroundColor: "rgba(238, 244, 250, 0.65)", borderColor: "rgba(255, 255, 255, 0.6)" },
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

  centered: { alignItems: "center", justifyContent: "center", gap: 10, padding: spacing.xl },
  centeredText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 260,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.text,
  },
  retryText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },

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
