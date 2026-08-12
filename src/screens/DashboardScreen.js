import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  typography,
  radius,
  fonts,
  layout,
  surface,
  numeric,
} from "../theme/theme";
import { useTabContentInset, useScreenTopInset } from "../navigation/tabBarInset";
import ScreenHeader from "../components/ScreenHeader";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import FadeIn from "../components/FadeIn";
import { SectionLabel, Stat, Divider, Card, StatusTag } from "../components/ui";
import { NOW } from "../data/mockData";
import { dutyStatus, DUTY_STATUS, summarise } from "../domain/duties";
import { deriveAlerts, describeAlert, ALERT_KIND, QUICK_REASONS } from "../domain/alerts";
import { fmtTime, plural } from "../utils/format";
import { useSchoolData } from "../context/SchoolDataContext";
import { useAuth } from "../context/AuthContext";
import { canCloseAlerts } from "../domain/roles";
import { useToast } from "../components/Toast";
import { haptics } from "../lib/haptics";

// Left edge of the checkpoint rows' text, so the dividers between them start
// at the same x as the titles above and below them.
const FEED_INSET = spacing.md;

// Checkpoint state → the shared tag vocabulary used on Duties and Roster.
const FEED_TONE = {
  [DUTY_STATUS.DONE]: "submitted",
  [DUTY_STATUS.OVERDUE]: "overdue",
  [DUTY_STATUS.DUE]: "due",
  [DUTY_STATUS.UPCOMING]: "pending",
};

export default function DashboardScreen() {
  const { students, duties, records, studentsForDuty, refresh } = useSchoolData();
  const { user } = useAuth();
  const toast = useToast();
  // Closing an alert is a written, attributable act (SRS F4) — the nurse can
  // see the board but the remark has to come from a coordinator or above.
  const mayClose = canCloseAlerts(user?.role);
  const [refreshing, setRefreshing] = useState(false);
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll } = useScrolled();

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
    toast.show(`${resolving.student.name} accounted for`);
    setResolving(null);
    setRemark("");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabInset }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <ScreenHeader
          title="Today"
          subtitle={`Bhaktivedanta Gurukula & International School · Friday, ${fmtTime(NOW)}`}
        />

        {/* The safety number leads: it is the reason the system exists. */}
        <View style={[styles.hero, open.length > 0 ? styles.heroAlarm : styles.heroCalm]}>
          {open.length === 0 ? (
            <>
              <View style={styles.heroIcon}>
                <Ionicons name="shield-checkmark" size={24} color={colors.onDark} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>All students accounted for</Text>
                <Text style={styles.heroSub}>
                  {submitted.length} of {duties.length} checkpoints marked so far.
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.heroIcon}>
                <Text style={styles.heroBig}>{open.length}</Text>
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>{plural(open.length, "student")} to check on</Text>
                <Text style={styles.heroSub}>Marked absent and not yet explained.</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.statsRow}>
          <Card tone="card" style={styles.statCard}>
            <Stat value={students.length} label="Students" />
          </Card>
          <Card tone="card" style={styles.statCard}>
            <Stat value={`${submitted.length}/${duties.length}`} label="Marked" />
          </Card>
          <Card tone="card" style={styles.statCard}>
            <Stat value={overdue.length} label="Overdue" tone={overdue.length > 0 ? "warning" : undefined} />
          </Card>
        </View>

        {open.length > 0 && (
          <>
            <SectionLabel count={open.length} tone="overdue">
              Needs checking
            </SectionLabel>
            {open.map((a, i) => (
              <FadeIn key={a.id} index={i}>
                <AlertCard
                  alert={a}
                  onResolve={
                    mayClose
                      ? () => {
                          setResolving(a);
                          setRemark("");
                        }
                      : null
                  }
                />
              </FadeIn>
            ))}
          </>
        )}

        <SectionLabel>Checkpoints</SectionLabel>
        <Card style={styles.group}>
          {duties.map((d, i) => {
            const status = dutyStatus(d, records, NOW);
            const total = studentsForDuty(d).length;
            const { present } = summarise(total, records[d.id]?.statuses);
            return (
              <View key={d.id}>
                {i > 0 && <Divider inset={FEED_INSET} />}
                <View style={styles.feedRow}>
                  <View style={styles.feedMain}>
                    <Text style={styles.feedTitle} numberOfLines={1}>
                      {d.checkpoint}
                    </Text>
                    {/* One caption that always answers the same question in the
                        same place: what came in, or when it is due to. */}
                    <Text style={typography.caption} numberOfLines={1}>
                      {d.group} ·{" "}
                      {status === DUTY_STATUS.DONE ? (
                        <Text style={styles.feedMeta}>
                          {present}/{total} present
                        </Text>
                      ) : (
                        `closes ${fmtTime(d.end)}`
                      )}
                    </Text>
                  </View>
                  <StatusTag tone={FEED_TONE[status]} />
                </View>
              </View>
            );
          })}
        </Card>

        {closed.length > 0 && (
          <>
            <SectionLabel count={closed.length} tone="submitted">
              Sorted out
            </SectionLabel>
            {closed.map((a) => (
              <View key={a.id} style={styles.closedCard}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <View style={styles.closedMain}>
                  <Text style={styles.closedName} numberOfLines={1}>
                    {a.student.name}
                  </Text>
                  <Text style={styles.closedRemark} numberOfLines={2}>
                    {resolved[a.id].remark}
                  </Text>
                </View>
                <Text style={styles.closedTime}>{resolved[a.id].at}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <EdgeFade top={0} height={topInset} visible={scrolled} />

      {/* Resolving is a tap, not an essay. Typing a sentence on a phone is the
          slowest possible way to record "found him, he's fine". */}
      <BottomSheet
        visible={!!resolving}
        onClose={() => setResolving(null)}
        title={resolving?.student.name}
        subtitle="Where is this student?"
      >
        {QUICK_REASONS.map((r) => (
          <SheetOption
            key={r.id}
            icon={r.icon}
            label={r.label}
            onPress={() => resolve(r.label)}
            trailing={<Ionicons name="chevron-forward" size={16} color={colors.icon} />}
          />
        ))}

        <Text style={[typography.label, styles.orLabel]}>OR WRITE IT</Text>
        <View style={styles.otherRow}>
          <TextInput
            value={remark}
            onChangeText={setRemark}
            placeholder="Something else…"
            placeholderTextColor={colors.textMuted}
            style={styles.otherInput}
            returnKeyType="done"
            onSubmitEditing={() => resolve(remark)}
            accessibilityLabel="Write where this student is"
          />
          <TouchableOpacity
            onPress={() => resolve(remark)}
            disabled={!remark.trim()}
            style={[styles.otherBtn, !remark.trim() && { opacity: 0.35 }]}
            accessibilityRole="button"
            accessibilityLabel="Save remark"
            accessibilityState={{ disabled: !remark.trim() }}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function AlertCard({ alert, onResolve }) {
  const urgent = alert.kind === ALERT_KIND.WENT_MISSING;
  return (
    <View style={[styles.alertCard, urgent && styles.alertCardUrgent]}>
      <View style={styles.alertTop}>
        <Text style={styles.alertName} numberOfLines={1}>
          {alert.student.name}
        </Text>
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

      {!!onResolve && (
        <TouchableOpacity
          style={styles.resolveBtn}
          onPress={onResolve}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Record where ${alert.student.name} is`}
        >
          <Text style={styles.resolveBtnText}>Where is this student?</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter },

  // The one thing on the screen that must be readable from across a room. It
  // is solid — calm reads deep teal, alarm reads wine — because as a pale
  // tinted card it was indistinguishable from the stat cards beneath it.
  hero: {
    ...surface.inverse,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  heroCalm: { backgroundColor: colors.primaryDeep, borderColor: colors.primary },
  heroAlarm: { backgroundColor: colors.danger, borderColor: colors.danger },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
  },
  heroText: { flex: 1, minWidth: 0, gap: 2 },
  heroBig: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, color: colors.onDark, ...numeric },
  heroTitle: { ...typography.h2, fontSize: 16, lineHeight: 21, color: colors.onDark },
  heroSub: { ...typography.caption, color: colors.onDarkMuted },

  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  statCard: { flex: 1, paddingVertical: spacing.md - 2, paddingHorizontal: spacing.xs },

  alertCard: {
    ...surface.raised,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertCardUrgent: { borderColor: colors.danger, borderWidth: 1.5, backgroundColor: colors.dangerBg },
  alertTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  alertName: { ...typography.h1, fontSize: 18, lineHeight: 24, flexShrink: 1 },
  urgentTag: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  urgentTagText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    lineHeight: 12,
    color: colors.white,
    letterSpacing: 0.6,
  },
  alertBody: { ...typography.body, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  // Large target, and a plain question rather than "close with remark".
  resolveBtn: {
    marginTop: spacing.md,
    minHeight: layout.touch,
    paddingVertical: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  resolveBtnText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.white },

  group: { padding: 0, overflow: "hidden" },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    minHeight: layout.row,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  feedMain: { flex: 1, minWidth: 0, gap: 1 },
  feedTitle: { ...typography.bodyStrong },
  feedMeta: { fontFamily: fonts.bold, color: colors.text, ...numeric },

  closedCard: {
    ...surface.sunken,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    borderRadius: radius.md,
    padding: spacing.md - 2,
    marginBottom: spacing.sm,
  },
  closedMain: { flex: 1, minWidth: 0, gap: 1 },
  closedName: { ...typography.bodyStrong },
  closedRemark: { ...typography.caption },
  closedTime: { ...typography.caption, fontSize: 11, ...numeric },

  orLabel: { marginTop: spacing.md, marginBottom: spacing.sm },
  otherRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  otherInput: {
    flex: 1,
    minHeight: layout.touch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  otherBtn: {
    width: layout.touch,
    height: layout.touch,
    borderRadius: layout.touch / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
