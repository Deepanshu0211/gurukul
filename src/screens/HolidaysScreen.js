import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout, surface } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import { EmptyState, ErrorState, PrimaryButton, Pill, Row, SectionLabel } from "../components/ui";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { useScreenTopInset } from "../navigation/tabBarInset";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { canDeclareHoliday } from "../domain/roles";
import { fetchHolidays, daysBetween } from "../lib/holidays";
import { haptics } from "../lib/haptics";
import { describeError } from "../lib/errors";
import { fmtDay, plural, todayISO, weekdayOf } from "../utils/format";

/**
 * Declaring days the school does not take a register.
 *
 * WHY THIS SCREEN IS WORTH ITS WEIGHT
 * Without it, the nightly generator builds the same twenty-odd checkpoints on
 * Diwali as on a Tuesday, the reminder ladder chases teachers who are four
 * hundred kilometres away, and by evening the Principal has an inbox of
 * escalations for an empty school. People then learn to ignore that inbox,
 * which is how the one alert that means a child is actually missing ends up
 * in a folder nobody reads.
 *
 * THE CHOICE THIS SCREEN IS BUILT AROUND
 * This is a residential school, so "no classes today" and "no children on
 * campus today" are different sentences and the app refuses to guess which
 * one is meant. Every declaration names it explicitly, in those words, and
 * the confirmation says what will actually stop being marked.
 */

const KINDS = [
  {
    key: "classes",
    hostel: true,
    title: "Classes off",
    hint: "The boarders are still here. Mangalarati, prasadam and night attendance still run.",
    tone: "warning",
    badge: "Classes off",
  },
  {
    key: "closed",
    hostel: false,
    title: "Campus closed",
    hint: "Nobody is here. No checkpoint is taken at all that day.",
    tone: "danger",
    badge: "Campus closed",
  },
];

const kindOf = (holiday) => (holiday.hostelCheckpoints ? KINDS[0] : KINDS[1]);

/** The next 90 days, as pickable rows. A holiday is always declared forward. */
const upcomingDays = () => {
  const out = [];
  const cursor = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  for (let i = 0; i < 90; i += 1) {
    out.push(
      `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

export default function HolidaysScreen({ navigation }) {
  const { user } = useAuth();
  const { declareHoliday, cancelHoliday, staffName } = useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const topInset = useScreenTopInset();

  const allowed = canDeclareHoliday(user?.role);

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [label, setLabel] = useState("");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [kind, setKind] = useState("classes");
  // Which date field the day picker is filling — "from", "to", or null.
  const [picking, setPicking] = useState(null);
  const [busy, setBusy] = useState(false);

  const days = useMemo(upcomingDays, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHolidays(await fetchHolidays(todayISO()));
    } catch (e) {
      setError(e.message || "Could not load the holiday calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Consecutive days sharing a label and a kind, shown as one entry.
   *
   * The table stores a row per day — every question the app asks is about one
   * day, so that is the right shape to store. It is the wrong shape to READ:
   * a two-week winter break as fourteen identical rows is a list nobody
   * scans, and the thing a coordinator wants to check at a glance is "is the
   * break in?", not "is the 27th in?".
   */
  const spans = useMemo(() => {
    const out = [];
    holidays.forEach((h) => {
      const last = out[out.length - 1];
      const isNext =
        last &&
        last.label === h.label &&
        last.hostelCheckpoints === h.hostelCheckpoints &&
        daysBetween(last.to, h.day).length === 2;
      if (isNext) {
        last.to = h.day;
        last.days.push(h.day);
      } else {
        out.push({ ...h, from: h.day, to: h.day, days: [h.day] });
      }
    });
    return out;
  }, [holidays]);

  const pickDay = (iso) => {
    if (picking === "from") {
      setFrom(iso);
      // Keep the range valid rather than refusing it. Moving the start past
      // the end is a normal correction, not a mistake to be told off for.
      if (iso > to) setTo(iso);
    } else if (picking === "to") {
      setTo(iso < from ? from : iso);
    }
    setPicking(null);
  };

  const chosen = KINDS.find((k) => k.key === kind) || KINDS[0];
  const span = useMemo(() => daysBetween(from, to), [from, to]);
  const canSubmit = label.trim().length > 1 && !busy;

  const confirmDeclare = () => {
    const what = chosen.hostel
      ? "Class registers will not be taken on " +
        (span.length === 1 ? "that day" : "those days") +
        ". Mangalarati, prasadam and night attendance still run, so the boarders are still counted."
      : "No attendance at all will be taken on " +
        (span.length === 1 ? "that day" : "those days") +
        " — including Mangalarati, prasadam and night attendance. Declare this only if the hostel is empty.";

    haptics.warn();
    dialog.confirm({
      icon: "calendar-outline",
      title: `Declare ${plural(span.length, "day")} as “${label.trim()}”?`,
      message:
        `${what} Any checkpoint already submitted stays on the record; ` +
        `the rest are withdrawn and every assigned teacher stops being chased for them.`,
      cancelLabel: "Review",
      confirmLabel: "Declare",
      destructive: !chosen.hostel,
      onConfirm: doDeclare,
    });
  };

  const doDeclare = async () => {
    setBusy(true);
    try {
      await declareHoliday({
        from,
        to,
        label: label.trim(),
        hostelCheckpoints: chosen.hostel,
        note: null,
      });
      haptics.success();
      setLabel("");
      await load();
      toast.show(`${plural(span.length, "day")} declared · ${label.trim()}`);
    } catch (e) {
      const shown = describeError(
        e,
        {
          title: "Not declared",
          message: "Something went wrong writing to the school calendar. Nothing was changed.",
        },
        "Nothing was changed. Try again when you have signal."
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

  const confirmCancel = (entry) => {
    haptics.warn();
    dialog.confirm({
      icon: "refresh-outline",
      title: `Cancel “${entry.label}”?`,
      message:
        `${plural(entry.days.length, "day")} goes back to being an ordinary school day and every ` +
        `checkpoint is rebuilt, with the usual teachers assigned. Registers already submitted on ` +
        `${entry.days.length === 1 ? "that day" : "those days"} are untouched.`,
      cancelLabel: "Keep it",
      confirmLabel: "Cancel holiday",
      destructive: true,
      onConfirm: async () => {
        try {
          // One day at a time: `cancelHoliday` deletes a single row, and each
          // delete is what rebuilds that day's checkpoints. Sequential rather
          // than parallel so the regeneration triggers do not contend for the
          // same duty ids.
          for (const day of entry.days) {
            // eslint-disable-next-line no-await-in-loop
            await cancelHoliday(day);
          }
          haptics.success();
          await load();
          toast.show(`${entry.label} cancelled · checkpoints restored`);
        } catch (e) {
          const shown = describeError(
            e,
            {
              title: "Not cancelled",
              message: "Something went wrong writing to the school calendar.",
            },
            "Nothing was changed. Try again when you have signal."
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
          <BackRow onPress={() => navigation.goBack()} />
          <EmptyState
            icon="lock-closed-outline"
            title="Not your call"
            body="A holiday cancels every teacher's duties for that day, so it is declared by a coordinator or an administrator."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <FlatList
        data={spans}
        keyExtractor={(h) => h.from}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ paddingTop: topInset }}>
            <BackRow onPress={() => navigation.goBack()} />
            <ScreenHeader
              title="Holidays"
              subtitle="Days the school does not take a register"
            />

            <View style={styles.form}>
              <Text style={styles.fieldLabel}>What is it called?</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Diwali break, Exam days, Founder's day…"
                placeholderTextColor={colors.icon}
                style={styles.input}
                maxLength={60}
                accessibilityLabel="Name of the holiday"
              />

              <Text style={styles.fieldLabel}>Which days?</Text>
              <View style={styles.rangeRow}>
                <DayButton
                  caption="From"
                  day={from}
                  onPress={() => setPicking("from")}
                />
                <Ionicons name="arrow-forward" size={16} color={colors.icon} />
                <DayButton caption="To" day={to} onPress={() => setPicking("to")} />
              </View>
              <Text style={styles.footnote}>
                {plural(span.length, "day")}
                {span.length > 1 ? `, ${fmtDay(from)} to ${fmtDay(to)}` : ""}
              </Text>

              <Text style={styles.fieldLabel}>What kind of holiday?</Text>
              {KINDS.map((k) => (
                <TouchableOpacity
                  key={k.key}
                  onPress={() => setKind(k.key)}
                  activeOpacity={0.8}
                  style={[styles.kind, kind === k.key && styles.kindOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: kind === k.key }}
                  accessibilityLabel={`${k.title}. ${k.hint}`}
                >
                  <Ionicons
                    name={kind === k.key ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={kind === k.key ? colors.primary : colors.icon}
                  />
                  <View style={styles.kindText}>
                    <Text style={typography.h3}>{k.title}</Text>
                    <Text style={typography.caption}>{k.hint}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              <PrimaryButton
                title={busy ? "Declaring…" : "Declare holiday"}
                onPress={confirmDeclare}
                disabled={!canSubmit}
                style={styles.declareBtn}
              />
            </View>

            <SectionLabel count={spans.length || undefined}>Declared</SectionLabel>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <ErrorState error={error} title="Could not load the calendar" onRetry={load} />
          ) : loading ? null : (
            <EmptyState
              icon="calendar-clear-outline"
              title="No holidays declared"
              body="Every day ahead is an ordinary school day. Declare one above and that day's checkpoints are withdrawn straight away."
              compact
            />
          )
        }
        renderItem={({ item }) => {
          const k = kindOf(item);
          return (
            <View style={styles.card}>
              <View style={styles.cardMain}>
                <Text style={typography.h3} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={typography.caption} numberOfLines={2}>
                  {item.days.length === 1
                    ? `${weekdayOf(item.from)}, ${fmtDay(item.from)}`
                    : `${fmtDay(item.from)} – ${fmtDay(item.to)} · ${plural(item.days.length, "day")}`}
                  {item.declaredBy ? ` · declared by ${staffName(item.declaredBy) || "a coordinator"}` : ""}
                </Text>
                <View style={styles.badgeRow}>
                  <Pill label={k.badge} tone={k.tone} icon={k.hostel ? "school" : "home"} />
                </View>
              </View>
              <TouchableOpacity
                onPress={() => confirmCancel(item)}
                style={styles.cancelBtn}
                hitSlop={layout.hitSlop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Cancel ${item.label}`}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <BottomSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking === "to" ? "Last day" : "First day"}
        subtitle="Holidays are declared ahead. The next 90 days."
        showClose
      >
        {days.map((iso) => (
          <SheetOption
            key={iso}
            label={fmtDay(iso)}
            hint={weekdayOf(iso)}
            active={iso === (picking === "to" ? to : from)}
            onPress={() => pickDay(iso)}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

function BackRow({ onPress }) {
  return (
    <View style={styles.head}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.back}
        hitSlop={layout.hitSlop}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back to account"
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

function DayButton({ caption, day, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.dayBtn}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${caption}: ${fmtDay(day)}. Change`}
    >
      <Text style={styles.dayCaption}>{caption.toUpperCase()}</Text>
      <Text style={styles.dayValue} numberOfLines={1}>
        {fmtDay(day)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingBottom: spacing.sm },
  back: {
    width: layout.touch,
    height: layout.touch,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },

  form: {
    ...surface.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs + 2 },
  input: {
    ...surface.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 2,
    minHeight: layout.touch,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },

  rangeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayBtn: {
    ...surface.sunken,
    flex: 1,
    minWidth: 0,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm - 2,
    justifyContent: "center",
  },
  dayCaption: { ...typography.label, marginBottom: 1 },
  dayValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },

  footnote: { ...typography.caption, marginTop: spacing.xs + 2, marginBottom: spacing.md },

  kind: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: spacing.xs + 2,
  },
  kindOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  kindText: { flex: 1, minWidth: 0, gap: 2 },

  declareBtn: { marginTop: spacing.sm },

  card: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md - 2,
    marginBottom: spacing.sm,
  },
  cardMain: { flex: 1, minWidth: 0, gap: 2 },
  badgeRow: { flexDirection: "row", marginTop: spacing.xs },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardAlt,
  },
});
