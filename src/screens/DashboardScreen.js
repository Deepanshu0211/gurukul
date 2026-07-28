import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import { TAB_CONTENT_INSET } from "../navigation/tabBarInset";
import { NOW } from "../data/mockData";
import { dutyStatus, DUTY_STATUS, summarise } from "../domain/duties";
import { deriveAlerts, describeAlert, ALERT_KIND, QUICK_REASONS } from "../domain/alerts";
import { fmtTime, plural } from "../utils/format";
import { useSchoolData } from "../context/SchoolDataContext";
import { haptics } from "../lib/haptics";

export default function DashboardScreen() {
  const { students, duties, records, studentsForDuty, refresh } = useSchoolData();
  const [refreshing, setRefreshing] = useState(false);

  // Resolutions are local for now. There is no `alerts` table yet, so these
  // are lost on restart — the remark must persist and be audit-logged before
  // the pilot (SRS F4).
  const [resolved, setResolved] = useState({});
  const [resolving, setResolving] = useState(null);
  const [remark, setRemark] = useState("");

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

  const alerts = useMemo(
    () => deriveAlerts(duties, records, studentsForDuty, NOW),
    [duties, records, studentsForDuty]
  );

  const open = alerts.filter((a) => !resolved[a.id]);
  const closed = alerts.filter((a) => resolved[a.id]);

  const submitted = duties.filter((d) => dutyStatus(d, records, NOW) === DUTY_STATUS.DONE);
  const overdue = duties.filter((d) => dutyStatus(d, records, NOW) === DUTY_STATUS.OVERDUE);

  const resolve = (reason) => {
    if (!reason?.trim()) return;
    haptics.success();
    setResolved((prev) => ({
      ...prev,
      [resolving.id]: { remark: reason.trim(), at: fmtTime(NOW) },
    }));
    setResolving(null);
    setRemark("");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.pageTitle}>Today</Text>
        <Text style={typography.caption}>Bhaktivedanta Gurukula · Friday, {fmtTime(NOW)}</Text>

        {/* The safety number leads: it is the reason the system exists. */}
        <View style={[styles.hero, open.length > 0 && styles.heroAlarm]}>
          {open.length === 0 ? (
            <>
              <Ionicons name="shield-checkmark" size={24} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>All students accounted for</Text>
                <Text style={styles.heroSub}>
                  {submitted.length} of {duties.length} checkpoints marked so far.
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.heroBig}>{open.length}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitle, { color: colors.danger }]}>
                  {plural(open.length, "student")} to check on
                </Text>
                <Text style={styles.heroSub}>Marked absent and not yet explained.</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.statsRow}>
          <Stat value={students.length} label="Students" />
          <Stat value={`${submitted.length}/${duties.length}`} label="Marked" />
          <Stat value={overdue.length} label="Overdue" warn={overdue.length > 0} />
        </View>

        {open.length > 0 && (
          <>
            <SectionTitle text="NEEDS CHECKING" count={open.length} />
            {open.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                onResolve={() => {
                  setResolving(a);
                  setRemark("");
                }}
              />
            ))}
          </>
        )}

        <SectionTitle text="CHECKPOINTS" />
        <View style={styles.group}>
          {duties.map((d, i) => {
            const status = dutyStatus(d, records, NOW);
            const total = studentsForDuty(d).length;
            const { present } = summarise(total, records[d.id]?.statuses);
            return (
              <View key={d.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.feedRow}>
                  <View style={[styles.dot, DOT[status]]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedTitle}>{d.checkpoint}</Text>
                    <Text style={typography.caption} numberOfLines={1}>
                      {d.group}
                    </Text>
                  </View>
                  <Text style={styles.feedMeta}>
                    {status === DUTY_STATUS.DONE
                      ? `${present}/${total}`
                      : status === DUTY_STATUS.OVERDUE
                      ? "Overdue"
                      : fmtTime(d.start)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {closed.length > 0 && (
          <>
            <SectionTitle text="SORTED OUT" count={closed.length} />
            {closed.map((a) => (
              <View key={a.id} style={styles.closedCard}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.closedName}>{a.student.name}</Text>
                  <Text style={styles.closedRemark}>{resolved[a.id].remark}</Text>
                </View>
                <Text style={styles.closedTime}>{resolved[a.id].at}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Resolving is a tap, not an essay. Typing a sentence on a phone is the
          slowest possible way to record "found him, he's fine". */}
      <Modal
        visible={!!resolving}
        transparent
        animationType="slide"
        onRequestClose={() => setResolving(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setResolving(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>{resolving?.student.name}</Text>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            Where is this student?
          </Text>

          {QUICK_REASONS.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.reasonRow}
              onPress={() => resolve(r.label)}
              activeOpacity={0.7}
            >
              <Ionicons name={r.icon} size={20} color={colors.text} />
              <Text style={styles.reasonLabel}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.border} />
            </TouchableOpacity>
          ))}

          <Text style={[typography.label, { marginTop: spacing.md, marginBottom: 6 }]}>
            OR WRITE IT
          </Text>
          <View style={styles.otherRow}>
            <TextInput
              value={remark}
              onChangeText={setRemark}
              placeholder="Something else…"
              placeholderTextColor={colors.textMuted}
              style={styles.otherInput}
            />
            <TouchableOpacity
              onPress={() => resolve(remark)}
              disabled={!remark.trim()}
              style={[styles.otherBtn, !remark.trim() && { opacity: 0.35 }]}
            >
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AlertCard({ alert, onResolve }) {
  const urgent = alert.kind === ALERT_KIND.WENT_MISSING;
  return (
    <View style={[styles.alertCard, urgent && styles.alertCardUrgent]}>
      <View style={styles.alertTop}>
        <Text style={styles.alertName}>{alert.student.name}</Text>
        {urgent && (
          <View style={styles.urgentTag}>
            <Text style={styles.urgentTagText}>WENT MISSING</Text>
          </View>
        )}
      </View>
      <Text style={typography.caption}>
        Class {alert.student.label} · Roll {alert.student.roll || "—"}
      </Text>
      <Text style={styles.alertBody}>{describeAlert(alert)}</Text>

      <TouchableOpacity style={styles.resolveBtn} onPress={onResolve} activeOpacity={0.85}>
        <Text style={styles.resolveBtnText}>Where is this student?</Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionTitle({ text, count }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{text}</Text>
      {count != null && <Text style={styles.sectionCount}>{count}</Text>}
    </View>
  );
}

function Stat({ value, label, warn }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, warn && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const DOT = {
  [DUTY_STATUS.DONE]: { backgroundColor: colors.success },
  [DUTY_STATUS.OVERDUE]: { backgroundColor: colors.danger },
  [DUTY_STATUS.DUE]: { backgroundColor: colors.warning },
  [DUTY_STATUS.UPCOMING]: { backgroundColor: colors.border },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: TAB_CONTENT_INSET,
  },
  pageTitle: { fontFamily: fonts.bold, fontSize: 26, color: colors.text, letterSpacing: -0.4 },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  heroAlarm: { backgroundColor: colors.dangerBg },
  heroBig: { fontFamily: fonts.bold, fontSize: 40, color: colors.danger, lineHeight: 44 },
  heroTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  heroSub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  statLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 1 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    letterSpacing: 1.3,
    color: colors.textMuted,
  },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 11, color: colors.border },

  alertCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertCardUrgent: {
    borderColor: colors.danger,
    borderWidth: 1.5,
    backgroundColor: colors.dangerBg,
  },
  alertTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 1 },
  alertName: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, flexShrink: 1 },
  urgentTag: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  urgentTagText: { fontFamily: fonts.bold, fontSize: 9, color: colors.white, letterSpacing: 0.5 },
  alertBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.text,
    lineHeight: 19,
    marginTop: 8,
  },
  // Large target, and a plain question rather than "close with remark".
  resolveBtn: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  resolveBtnText: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.white },

  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  feedTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  feedMeta: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 31 },

  closedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    padding: spacing.md - 2,
    marginBottom: 7,
  },
  closedName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  closedRemark: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  closedTime: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetGrip: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },

  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 7,
  },
  reasonLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },

  otherRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  otherInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.text,
  },
  otherBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
