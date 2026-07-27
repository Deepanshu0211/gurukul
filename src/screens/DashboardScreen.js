import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import {
  DUTIES,
  STUDENTS,
  ALERTS,
  NOW,
  fmtTime,
  dutyStatus,
  studentsForDuty,
} from "../data/mockData";
import { useAttendance } from "../context/AttendanceContext";

export default function DashboardScreen() {
  const { records } = useAttendance();
  const [alerts, setAlerts] = useState(ALERTS);
  const [closing, setClosing] = useState(null);
  const [remark, setRemark] = useState("");

  const open = alerts.filter((a) => !a.closedAt);
  const closed = alerts.filter((a) => a.closedAt);
  const critical = open.filter((a) => a.severity === "critical");

  const submitted = DUTIES.filter((d) => dutyStatus(d, records) === "done");
  const overdue = DUTIES.filter((d) => dutyStatus(d, records) === "overdue");

  // Across every submitted duty today: how many student-checks were absent?
  let checks = 0;
  let absent = 0;
  submitted.forEach((d) => {
    checks += studentsForDuty(d).length;
    const st = (records[d.id] && records[d.id].statuses) || {};
    absent += Object.values(st).filter((s) => s === "A").length;
  });
  const accounted = checks - absent;

  const closeAlert = () => {
    if (!remark.trim()) return;
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === closing.id ? { ...a, closedAt: fmtTime(NOW), closeRemark: remark.trim() } : a
      )
    );
    setClosing(null);
    setRemark("");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Overview</Text>
        <Text style={typography.caption}>
          Bhaktivedanta Gurukula · Friday, {fmtTime(NOW)}
        </Text>

        {/* The safety number leads, because it is the point of the system. */}
        <View style={[styles.hero, critical.length > 0 && styles.heroAlarm]}>
          <Text style={styles.heroLabel}>
            {critical.length > 0 ? "UNACCOUNTED FOR" : "ALL STUDENTS ACCOUNTED FOR"}
          </Text>
          <View style={styles.heroRow}>
            <Text style={[styles.heroValue, critical.length > 0 && { color: colors.danger }]}>
              {critical.length > 0 ? critical.length : accounted}
            </Text>
            <Text style={styles.heroUnit}>
              {critical.length > 0
                ? `student${critical.length === 1 ? "" : "s"} need${critical.length === 1 ? "s" : ""} checking`
                : `of ${checks} checks today`}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard value={STUDENTS.length} label="Students" />
          <StatCard value={`${submitted.length}/${DUTIES.length}`} label="Submitted" />
          <StatCard value={overdue.length} label="Overdue" tone={overdue.length ? "warn" : null} />
        </View>

        <SectionTitle text="OPEN ALERTS" count={open.length} />
        {open.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
            <Text style={styles.emptyText}>No open alerts. Every child is accounted for.</Text>
          </View>
        ) : (
          open.map((a) => (
            <AlertCard key={a.id} alert={a} onClose={() => { setClosing(a); setRemark(""); }} />
          ))
        )}

        <SectionTitle text="CHECKPOINTS TODAY" />
        <View style={styles.group}>
          {DUTIES.map((d, i) => {
            const status = dutyStatus(d, records);
            const rec = records[d.id];
            const total = studentsForDuty(d).length;
            const marked = rec ? Object.keys(rec.statuses).length : 0;
            return (
              <View key={d.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.feedRow}>
                  <View style={[styles.dot, DOT[status]]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedTitle}>{d.checkpoint}</Text>
                    <Text style={typography.caption}>{d.group}</Text>
                  </View>
                  <Text style={styles.feedMeta}>
                    {status === "done"
                      ? `${total - marked}/${total}`
                      : status === "overdue"
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
            <SectionTitle text="RESOLVED" count={closed.length} />
            {closed.map((a) => (
              <View key={a.id} style={styles.closedCard}>
                <View style={styles.closedTop}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                  <Text style={styles.closedName}>{a.student || "Duty alert"}</Text>
                  <Text style={styles.closedTime}>{a.closedAt}</Text>
                </View>
                <Text style={styles.closedRemark}>“{a.closeRemark}”</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* SRS F4: an alert only closes with a written remark, never silently. */}
      <Modal visible={!!closing} transparent animationType="slide" onRequestClose={() => setClosing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setClosing(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>Close this alert</Text>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            {closing?.student ? `${closing.student} · ` : ""}Record what was found. This is kept in
            the audit log.
          </Text>
          <TextInput
            value={remark}
            onChangeText={setRemark}
            placeholder="e.g. Found in the library, safe."
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
            style={styles.remarkInput}
          />
          <TouchableOpacity
            style={[styles.saveBtn, !remark.trim() && { opacity: 0.4 }]}
            onPress={closeAlert}
            disabled={!remark.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>Close alert</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
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

function StatCard({ value, label, tone }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, tone === "warn" && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AlertCard({ alert, onClose }) {
  const isCritical = alert.severity === "critical";
  return (
    <View style={[styles.alertCard, isCritical && styles.alertCardCritical]}>
      <View style={styles.alertTop}>
        <Ionicons
          name={isCritical ? "warning" : "time-outline"}
          size={16}
          color={isCritical ? colors.danger : colors.warning}
        />
        <Text style={[styles.alertKind, { color: isCritical ? colors.danger : colors.warning }]}>
          {isCritical ? "SAFETY ALERT" : "OVERDUE"}
        </Text>
        <Text style={styles.alertTime}>{alert.time}</Text>
      </View>

      {alert.student && <Text style={styles.alertStudent}>{alert.student}</Text>}
      <Text style={typography.caption}>{alert.detail}</Text>
      <Text style={styles.alertText}>{alert.text}</Text>

      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
        <Text style={styles.closeBtnText}>Close with remark</Text>
      </TouchableOpacity>
    </View>
  );
}

const DOT = {
  done: { backgroundColor: colors.success },
  overdue: { backgroundColor: colors.danger },
  due: { backgroundColor: colors.warning },
  upcoming: { backgroundColor: colors.border },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 44 },
  pageTitle: { fontFamily: fonts.bold, fontSize: 28, color: colors.text, letterSpacing: -0.4 },

  hero: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  heroAlarm: { backgroundColor: colors.dangerBg },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 1.3, color: colors.textMuted },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  heroValue: { fontFamily: fonts.bold, fontSize: 34, color: colors.success },
  heroUnit: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, flex: 1 },

  statsRow: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  statValue: { fontFamily: fonts.bold, fontSize: 19, color: colors.text },
  statLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 1 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 1.3, color: colors.textMuted },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 11, color: colors.border },

  alertCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertCardCritical: { borderColor: colors.danger, borderWidth: 1.5, backgroundColor: colors.dangerBg },
  alertTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  alertKind: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, flex: 1 },
  alertTime: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },
  alertStudent: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  alertText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text, marginTop: 6, lineHeight: 18 },
  closeBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: "center",
  },
  closeBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },

  emptyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  emptyText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text, flex: 1 },

  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  feedTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  feedMeta: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 32 },

  closedCard: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  closedTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  closedName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, flex: 1 },
  closedTime: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  closedRemark: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 5,
    fontStyle: "italic",
  },

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
  sheetTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.text },
  remarkInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.text,
    minHeight: 88,
    textAlignVertical: "top",
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
});
