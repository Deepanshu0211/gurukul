import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout, surface } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import Segmented from "../components/Segmented";
import SearchField from "../components/SearchField";
import BottomSheet from "../components/BottomSheet";
import { EmptyState, ErrorState, PrimaryButton, Pill, Row } from "../components/ui";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { useScreenTopInset, useTabContentInset } from "../navigation/tabBarInset";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { canWorkGate } from "../domain/roles";
import { STATUS_META } from "../data/mockData";
import { haptics } from "../lib/haptics";
import { describeError } from "../lib/errors";
import { fmtClock, fmtDay, plural, todayISO } from "../utils/format";

/**
 * The gate desk.
 *
 * One question, asked twice a day in opposite directions: is this child
 * leaving the campus, or coming back onto it? Everything else on this screen
 * exists to make those two taps unambiguous, because the consequence of
 * getting them wrong is a child recorded in a building they are not in.
 *
 * What makes it worth a screen rather than a status in the marking sheet:
 * signing out here is what stops every teacher, at every later checkpoint,
 * having to guess. The status carries forward automatically and cannot be
 * cleared from a classroom — only from this desk (migration 034).
 *
 * The two tabs are deliberately unequal. "On campus" is a search — you know
 * the name, you are looking for it. "Signed out" is a list — it is short, it
 * is the thing the desk needs to see at a glance, and every row on it is a
 * child the school currently does not have.
 */

// Only the spanning statuses. Activity and Self study happen ON campus and end
// when the checkpoint does; a child signed out under one would carry it
// forever with nothing to clear it, and the database refuses them outright.
const LEAVE_REASONS = [
  { code: "H", hint: "Collected by family" },
  { code: "O", hint: "Approved outing" },
  { code: "S", hint: "Unwell — sent home or to hospital" },
  { code: "G", hint: "Travelling to Gita Nagari" },
];

const RETURN_CHOICES = [
  { key: "none", label: "Not known", days: null },
  { key: "1", label: "Tomorrow", days: 1 },
  { key: "3", label: "In 3 days", days: 3 },
  { key: "7", label: "In a week", days: 7 },
];

const plusDays = (n) => {
  if (n == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function GateScreen() {
  const { user } = useAuth();
  const { students, openLeaves, signStudentOut, signStudentIn, staffName, loading, error, refresh } =
    useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const topInset = useScreenTopInset();
  const bottomInset = useTabContentInset();

  const [tab, setTab] = useState("out");
  const [query, setQuery] = useState("");
  // The student whose sign-out sheet is open, and what it is being filled in
  // with. Held here rather than in the sheet so closing it cannot strand a
  // half-written reason.
  const [signingOut, setSigningOut] = useState(null);
  const [status, setStatus] = useState("H");
  const [reason, setReason] = useState("");
  const [back, setBack] = useState("none");
  const [busy, setBusy] = useState(false);

  const allowed = canWorkGate(user?.role);

  const away = useMemo(() => {
    const rows = Object.values(openLeaves);
    const byAdm = new Map(students.map((s) => [s.adm, s]));
    return rows
      .map((l) => ({ ...l, student: byAdm.get(l.adm) || null }))
      // Newest first: the desk is usually acting on somebody who left today.
      .sort((a, b) => String(b.outAt).localeCompare(String(a.outAt)));
  }, [openLeaves, students]);

  /**
   * Who can still be signed out — everyone not already away.
   *
   * Filtered rather than shown-and-disabled: a front desk under a queue does
   * not read row states, and a child who is already out being tappable is how
   * you end up with "already signed out" errors treated as noise.
   *
   * Search is required before anything is listed. 415 names in admission order
   * is not a list anybody scrolls; the desk always knows the name.
   */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter((s) => !openLeaves[s.adm])
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.adm.toLowerCase().includes(q) ||
          String(s.roll || "").includes(q)
      )
      .slice(0, 40);
  }, [students, openLeaves, query]);

  const openSignOut = useCallback((student) => {
    setSigningOut(student);
    setStatus("H");
    setReason("");
    setBack("none");
  }, []);

  const closeSignOut = () => {
    if (busy) return;
    setSigningOut(null);
  };

  const doSignOut = async () => {
    const student = signingOut;
    if (!student) return;
    setBusy(true);
    try {
      const days = RETURN_CHOICES.find((c) => c.key === back)?.days ?? null;
      await signStudentOut({
        adm: student.adm,
        status,
        reason: reason.trim(),
        expectedBack: plusDays(days),
      });
      haptics.success();
      setSigningOut(null);
      setQuery("");
      toast.show(
        `${student.name} signed out · ${STATUS_META[status]?.label || status} at every checkpoint until they are back`
      );
    } catch (e) {
      const shown = describeError(
        e,
        {
          title: "Not signed out",
          message: "Something went wrong at the gate register. Nothing was recorded — try again.",
        },
        "Nothing was recorded. Try again when you have signal."
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.title,
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Signing a child back in. One deliberate stop, always — not only when
   * something looks unusual.
   *
   * This is the tap that hands the child back to the teachers: from here the
   * next checkpoint expects them in the line and will raise a safety alert if
   * they are not. Pressing it for a child still sitting in their parents' car
   * produces exactly the false alarm this app exists to make meaningful.
   */
  const confirmSignIn = (row) => {
    const name = row.student?.name || row.adm;
    haptics.warn();
    dialog.confirm({
      icon: "enter-outline",
      title: `${name} is back on campus?`,
      message:
        `Only press this once you have seen them walk through the gate. ` +
        `From this moment teachers can mark ${name} present again, and any checkpoint ` +
        `that cannot find them will raise a safety alert.`,
      cancelLabel: "Not yet",
      confirmLabel: "Sign in",
      onConfirm: async () => {
        try {
          await signStudentIn(row.adm);
          haptics.success();
          toast.show(`${name} signed in · teachers can mark them present again`);
        } catch (e) {
          const shown = describeError(
            e,
            {
              title: "Not signed in",
              message: "Something went wrong at the gate register. Try again.",
            },
            "Nothing was recorded. Try again when you have signal."
          );
          dialog.alert({
            icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
            title: shown.title,
            message: shown.message,
            destructive: !shown.offline,
          });
        }
      },
    });
  };

  if (!allowed) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={{ paddingTop: topInset }}>
          <EmptyState
            icon="lock-closed-outline"
            title="Not your desk"
            body="Signing students in and out of the campus is done by reception, a coordinator or an administrator."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={[styles.head, { paddingTop: topInset }]}>
        <ScreenHeader
          title="Gate"
          subtitle={
            away.length
              ? `${plural(away.length, "student")} off campus`
              : "Everyone is on campus"
          }
          right={
            away.length ? (
              <Pill label={String(away.length)} icon="walk" tone="warning" />
            ) : (
              <Pill label="All in" icon="checkmark-circle" tone="success" />
            )
          }
        />
        <Segmented
          items={[
            { key: "out", label: "Sign out" },
            { key: "in", label: "Signed out", count: away.length || null },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {error ? (
        <ErrorState error={error} title="Could not load the gate register" onRetry={refresh} />
      ) : tab === "out" ? (
        <>
          <View style={styles.searchWrap}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Find the student leaving"
              hint={query.trim() ? `${candidates.length}` : undefined}
              accessibilityLabel="Find a student to sign out"
            />
          </View>
          <FlatList
            data={candidates}
            keyExtractor={(s) => s.adm}
            contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              query.trim() ? (
                <EmptyState
                  icon="search-outline"
                  title="No match"
                  body={`Nobody on campus matches “${query.trim()}”. A student who is already signed out will not appear here — check the other tab.`}
                  compact
                />
              ) : (
                <EmptyState
                  icon="person-outline"
                  title="Who is leaving?"
                  body="Type a name, roll number or admission number. Sign them out only once someone has come to collect them."
                  compact
                />
              )
            }
            renderItem={({ item }) => (
              <Row
                style={styles.card}
                onPress={() => openSignOut(item)}
                accessibilityRole="button"
                accessibilityLabel={`Sign out ${item.name}, class ${item.label}`}
              >
                <View style={styles.cardMain}>
                  <Text style={typography.h3} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    Class {item.label} · Roll {item.roll} · {item.adm}
                  </Text>
                </View>
                <Ionicons name="exit-outline" size={20} color={colors.primary} />
              </Row>
            )}
          />
        </>
      ) : (
        <FlatList
          data={away}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={refresh}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              title="Everyone is on campus"
              body="Nobody is signed out. When a student leaves, sign them out on the other tab so every checkpoint records them correctly."
              compact
            />
          }
          renderItem={({ item }) => {
            const name = item.student?.name || item.adm;
            const meta = STATUS_META[item.status];
            const overdue = item.expectedBack && item.expectedBack < todayISO();
            return (
              <View style={[styles.card, styles.awayCard]}>
                <View style={styles.cardMain}>
                  <Text style={typography.h3} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {item.student ? `Class ${item.student.label} · ` : ""}
                    {meta?.label || item.status} since {fmtDay(item.outDay)}
                    {item.outAt ? `, ${fmtClock(item.outAt)}` : ""}
                  </Text>
                  {!!item.reason && (
                    <Text style={typography.caption} numberOfLines={1}>
                      {item.reason}
                    </Text>
                  )}
                  <Text
                    style={[styles.expected, overdue && styles.expectedLate]}
                    numberOfLines={1}
                  >
                    {item.expectedBack
                      ? `${overdue ? "Was due back" : "Due back"} ${fmtDay(item.expectedBack)}`
                      : "No return date given"}
                    {item.outBy ? ` · out by ${staffName(item.outBy) || "reception"}` : ""}
                  </Text>
                </View>
                <PrimaryButton
                  title="Sign in"
                  onPress={() => confirmSignIn(item)}
                  style={styles.signInBtn}
                  textStyle={{ fontSize: 13 }}
                />
              </View>
            );
          }}
        />
      )}

      <BottomSheet
        visible={!!signingOut}
        onClose={closeSignOut}
        title={signingOut?.name}
        subtitle={
          signingOut
            ? `Class ${signingOut.label} · from now until you sign them back in`
            : undefined
        }
        showClose
      >
        {/* Chips, not four full-height option rows.
            The sheet is capped at 86% of the screen. Four stacked rows plus a
            note field plus the return chips plus the footnote runs past that
            on a small phone, which puts Sign out — the one control this whole
            screen exists for — behind a scroll that somebody working a queue
            at the front desk will not go looking for. The labels are one or
            two words each and lose nothing by being chips. */}
        <Text style={styles.fieldLabel}>Where are they going?</Text>
        <View style={styles.chipRow}>
          {LEAVE_REASONS.map(({ code }) => (
            <TouchableOpacity
              key={code}
              onPress={() => setStatus(code)}
              style={[styles.chip, status === code && styles.chipOn]}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: status === code }}
              accessibilityLabel={`${STATUS_META[code]?.label || code}. ${
                LEAVE_REASONS.find((r) => r.code === code)?.hint
              }`}
            >
              <Text style={[styles.chipText, status === code && styles.chipTextOn]}>
                {STATUS_META[code]?.label || code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.chipHint}>
          {LEAVE_REASONS.find((r) => r.code === status)?.hint}
        </Text>

        <Text style={styles.fieldLabel}>Note (optional)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Who collected them, or why"
          placeholderTextColor={colors.icon}
          style={styles.input}
          maxLength={120}
          accessibilityLabel="Note about this sign-out"
        />

        <Text style={styles.fieldLabel}>Expected back</Text>
        <View style={styles.chipRow}>
          {RETURN_CHOICES.map((c) => (
            <TouchableOpacity
              key={c.key}
              onPress={() => setBack(c.key)}
              style={[styles.chip, back === c.key && styles.chipOn]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: back === c.key }}
              accessibilityLabel={`Expected back ${c.label}`}
            >
              <Text style={[styles.chipText, back === c.key && styles.chipTextOn]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Said plainly, because it is the one thing about this screen that
            surprises people: the date is a note for the desk and nothing
            else. A child who does not come back on Sunday stays signed out,
            which is the truth and is what keeps the register honest. */}
        <Text style={styles.footnote}>
          A return date is only a note. Nothing brings a student back except signing them in here.
        </Text>

        <PrimaryButton
          title={busy ? "Signing out…" : `Sign out ${signingOut?.name?.split(" ")[0] || ""}`.trim()}
          onPress={doSignOut}
          disabled={busy}
          style={styles.sheetBtn}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  searchWrap: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  list: { paddingHorizontal: layout.gutter, paddingTop: spacing.xs },

  card: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md - 2,
    marginBottom: spacing.sm,
  },
  awayCard: { backgroundColor: colors.cardAlt },
  cardMain: { flex: 1, minWidth: 0, gap: 1 },

  expected: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  expectedLate: { color: colors.warning, fontFamily: fonts.semibold },

  signInBtn: { flexShrink: 0, paddingHorizontal: spacing.md, minHeight: layout.touch - 6 },

  fieldLabel: {
    ...typography.label,
    marginTop: spacing.md,
    marginBottom: spacing.xs + 2,
  },
  input: {
    ...surface.card,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 2,
    minHeight: layout.touch,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
  chip: {
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.white },
  chipHint: { ...typography.caption, marginTop: spacing.xs + 2 },

  footnote: {
    ...typography.caption,
    marginTop: spacing.sm,
    lineHeight: 17,
  },

  sheetBtn: { marginTop: spacing.md },
});
