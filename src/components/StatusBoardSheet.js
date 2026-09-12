import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet from "./BottomSheet";
import CalendarSheet from "./CalendarSheet";
import { EmptyState, ErrorState } from "./ui";
import { useAuth } from "../context/AuthContext";
import { fetchStatusBoard, totalOf, ownRow, COLUMNS } from "../lib/statusBoard";
import { isOversight } from "../domain/roles";
import { fmtClock, fmtDay, todayISO } from "../utils/format";
import { colors, spacing, typography, radius, numeric } from "../theme/theme";

/**
 * "Today's status" — the morning report's counts, on screen.
 *
 * The school's paper form has twelve columns per class. Two of them, Res and
 * Day, are the same numbers every single morning, which is why the school
 * calls them redundant to fill in: they are the class strength, not a
 * measurement of the day. They still belong on screen — you cannot read
 * "4 absent" without knowing it is 4 of 30 — so they are shown once in the
 * header line of each class rather than as two more columns to scan.
 *
 * WHO SEES WHAT
 * A class teacher gets their own class, opened, and nothing else to wade
 * through. Oversight gets every class and a Total, and can move to any past
 * day.
 *
 * The narrowing happens HERE, not in the database. class_status_board hands
 * all eighteen classes to any staff token — 005 made marks school-wide
 * readable deliberately — so the filter below is a judgement about what is
 * useful to a class teacher, not a permission boundary. Nothing secret is
 * being withheld by it, and nothing here should be relied on as a guard.
 *
 * This prints nothing and changes nothing about what is printed. The paper
 * sheets are built by `reportHtml.js` and are untouched.
 */
export default function StatusBoardSheet({ visible, onClose }) {
  const { user } = useAuth();
  const oversight = isOversight(user?.role);

  const [day, setDay] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [calendar, setCalendar] = useState(false);
  const [open, setOpen] = useState(null);

  // Reopening always returns to today. A sheet left on last Tuesday and
  // reopened next week would show stale numbers under a heading nobody reads.
  useEffect(() => {
    if (visible) {
      setDay(todayISO());
      setOpen(null);
    }
  }, [visible]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchStatusBoard(day, "morning"));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const mine = ownRow(rows, user?.classKey);
  // A teacher with a class sees only it. Everyone else — oversight, and duty
  // staff with no class of their own — sees the whole board.
  const shown = !oversight && mine ? [mine] : rows;
  const total = shown.length > 1 ? totalOf(shown) : null;

  const subtitle = oversight
    ? `Morning attendance · ${fmtDay(day)}`
    : mine
      ? `${mine.classLabel} · ${fmtDay(day)}`
      : `Morning attendance · ${fmtDay(day)}`;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Today's status"
        subtitle={subtitle}
        showClose
      >
        {oversight && (
          <Pressable style={styles.dayPick} onPress={() => setCalendar(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.dayPickLabel}>{fmtDay(day)}</Text>
            <Text style={styles.dayPickHint}>Change day</Text>
          </Pressable>
        )}

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <ErrorState error={error} title="Could not load the status" onRetry={load} compact />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title="No classes"
            body="The register has no classes for this day."
            compact
          />
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {shown.map((r) => (
              <ClassRow
                key={r.classKey}
                row={r}
                expanded={shown.length === 1 || open === r.classKey}
                onPress={() => setOpen(open === r.classKey ? null : r.classKey)}
                single={shown.length === 1}
              />
            ))}
            {total && <ClassRow row={total} expanded total />}
            <View style={{ height: spacing.lg }} />
          </ScrollView>
        )}
      </BottomSheet>

      <CalendarSheet
        visible={calendar}
        selected={day}
        onSelect={(d) => {
          setDay(d);
          setCalendar(false);
          setOpen(null);
        }}
        onClose={() => setCalendar(false)}
      />
    </>
  );
}

/**
 * One class. Collapsed it answers the only question worth asking at a glance —
 * is this class in, and is anyone missing. Expanded it is the paper form's
 * own six columns.
 */
function ClassRow({ row, expanded, onPress, single, total }) {
  const missing = row.resAbsent + row.dayAbsent;
  const present = row.resPresent + row.dayPresent;

  // Not submitted yet is not the same as everybody absent, and the difference
  // is the whole reason `unmarked` exists in 020. Say which it is.
  const pending = !row.submitted && row.unmarked === row.strength;

  return (
    <Pressable
      style={[styles.row, total && styles.rowTotal]}
      onPress={single || total ? undefined : onPress}
      disabled={single || total}
    >
      <View style={styles.rowHead}>
        <View style={styles.rowHeadText}>
          <Text style={[styles.className, total && styles.classNameTotal]} numberOfLines={1}>
            {row.classLabel}
          </Text>
          <Text style={styles.strength}>
            {row.res} res · {row.day} day · {row.strength} total
            {row.teacher ? ` · ${row.teacher}` : ""}
          </Text>
        </View>

        {pending ? (
          <View style={[styles.badge, styles.badgePending]}>
            <Text style={styles.badgePendingText}>Not marked</Text>
          </View>
        ) : (
          <View style={styles.headline}>
            <Text style={[styles.headlineNum, numeric]}>{present}</Text>
            <Text style={styles.headlineSep}>/</Text>
            <Text style={[styles.headlineDen, numeric]}>{row.strength}</Text>
            {missing > 0 && (
              <View style={[styles.badge, styles.badgeAbsent]}>
                <Text style={styles.badgeAbsentText}>{missing} absent</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {expanded && !pending && (
        <>
          <View style={styles.grid}>
            {COLUMNS.map((c) => (
              <View
                key={c.key}
                style={styles.cell}
                accessible
                // The heading a sighted reader gets from the column is spoken
                // here instead, because 'Res P' is read out as two letters.
                accessibilityLabel={`${c.label}: ${row[c.key]}`}
              >
                <Text style={[styles.cellNum, row[c.key] > 0 && styles.cellNumOn, numeric]}>
                  {row[c.key]}
                </Text>
                <Text style={styles.cellShort}>{c.short}</Text>
              </View>
            ))}
          </View>

          {/* Only ever shown when it is not zero. A row of "0 still to mark"
              under every complete class is noise; one under the class that is
              half done is the point. */}
          {row.unmarked > 0 && (
            <Text style={styles.footnote}>{row.unmarked} still to mark</Text>
          )}
          {row.submittedAt && (
            <Text style={styles.footnote}>Submitted at {fmtClock(row.submittedAt)}</Text>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: { paddingVertical: spacing.xl * 2, alignItems: "center" },
  list: { maxHeight: 460 },

  dayPick: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  dayPickLabel: { ...typography.bodyStrong, color: colors.primaryDark, flex: 1 },
  dayPickHint: { ...typography.caption, color: colors.primary },

  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowTotal: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowHeadText: { flex: 1 },
  className: { ...typography.bodyStrong, color: colors.text },
  classNameTotal: { ...typography.h3, color: colors.text },
  strength: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  headline: { flexDirection: "row", alignItems: "center", gap: 2 },
  headlineNum: { ...typography.h3, color: colors.text },
  headlineSep: { ...typography.body, color: colors.textMuted },
  headlineDen: { ...typography.body, color: colors.textMuted },

  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
  },
  badgeAbsent: { backgroundColor: colors.dangerBg },
  badgeAbsentText: { ...typography.caption, color: colors.danger },
  badgePending: { backgroundColor: colors.track },
  badgePendingText: { ...typography.caption, color: colors.textMuted },

  grid: {
    flexDirection: "row",
    marginTop: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  // Six cells in one row of six rather than two rows of three: they are the
  // register's columns and they read left to right, the way the paper does.
  cell: { flex: 1, paddingHorizontal: 2, paddingVertical: spacing.xs },
  cellNum: { ...typography.h3, color: colors.textMuted, textAlign: "center" },
  cellNumOn: { color: colors.text },
  cellShort: { ...typography.caption, color: colors.textMuted, textAlign: "center", fontSize: 11 },

  footnote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
