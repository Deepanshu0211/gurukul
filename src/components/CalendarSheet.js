import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, layout, typography, numeric } from "../theme/theme";
import BottomSheet from "./BottomSheet";
import { fetchMarkedDaysInMonth } from "../lib/history";
import { todayISO } from "../utils/format";

/**
 * Month calendar for picking a day to read attendance back from.
 *
 * Deliberately hand-built rather than a native date picker: the platform
 * pickers cannot show WHICH days actually have attendance, and that is the
 * whole question here. A teacher opening this wants "the days something was
 * marked", not an unbroken grid of 31 identical numbers — so days with a
 * submitted checkpoint carry a dot, and empty ones stay plainly empty.
 *
 * It also avoids adding a native module, which on Expo would mean a dev
 * client rebuild for what is a month grid and some arithmetic.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function CalendarSheet({ visible, selected, onSelect, onClose }) {
  // Which month the grid is showing. Opens on the selected day's month so the
  // current choice is always the first thing visible.
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (selected || todayISO()).split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const [markedDays, setMarkedDays] = useState(new Set());
  const [loading, setLoading] = useState(false);

  // Re-centre on the selected day each time the sheet is reopened, so it never
  // opens three months away from where the teacher left it.
  useEffect(() => {
    if (!visible) return;
    const [y, m] = (selected || todayISO()).split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
  }, [visible, selected]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    fetchMarkedDaysInMonth(cursor.year, cursor.month)
      .then((days) => !cancelled && setMarkedDays(days))
      // An unreachable server means no dots, not a broken calendar — every
      // date stays pickable and the day view reports the failure itself.
      .catch(() => !cancelled && setMarkedDays(new Set()))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [visible, cursor.year, cursor.month]);

  const today = todayISO();

  // A flat list of 7-column cells: leading nulls pad the month to its first
  // weekday, so the grid needs no per-row arithmetic while rendering.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1).getDay();
    const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out = Array.from({ length: first }, () => null);
    for (let d = 1; d <= count; d += 1) out.push(d);
    return out;
  }, [cursor.year, cursor.month]);

  const step = (delta) => {
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  // Never page past the current month — there is no attendance in the future,
  // and an endlessly forward-scrolling calendar just invites empty screens.
  const atCurrentMonth =
    cursor.year === Number(today.slice(0, 4)) && cursor.month === Number(today.slice(5, 7)) - 1;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Choose a date"
      subtitle="Days with a dot have attendance recorded."
      scroll={false}
      showClose
    >
      <View style={styles.monthBar}>
        <TouchableOpacity
          onPress={() => step(-1)}
          hitSlop={layout.hitSlop}
          activeOpacity={0.6}
          style={styles.monthBtn}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>

        <View style={styles.monthLabelWrap}>
          <Text style={styles.monthLabel}>
            {MONTHS[cursor.month]} {cursor.year}
          </Text>
          {loading && <ActivityIndicator size="small" color={colors.icon} />}
        </View>

        <TouchableOpacity
          onPress={() => step(1)}
          disabled={atCurrentMonth}
          hitSlop={layout.hitSlop}
          activeOpacity={0.6}
          style={[styles.monthBtn, atCurrentMonth && styles.monthBtnOff]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: atCurrentMonth }}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={atCurrentMonth ? colors.border : colors.primary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`${w}${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`pad${i}`} style={styles.cell} />;

          const value = iso(cursor.year, cursor.month, d);
          const isSelected = value === selected;
          const isToday = value === today;
          const isFuture = value > today;
          const hasData = markedDays.has(value);

          return (
            <TouchableOpacity
              key={value}
              style={styles.cell}
              disabled={isFuture}
              activeOpacity={0.7}
              onPress={() => {
                onSelect(value);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isFuture }}
              accessibilityLabel={`${d} ${MONTHS[cursor.month]}${
                hasData ? ", has attendance" : ""
              }`}
            >
              <View
                style={[
                  styles.day,
                  isToday && styles.dayToday,
                  isSelected && styles.daySelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isFuture && styles.dayTextOff,
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {d}
                </Text>
              </View>
              {/* Outside the pill so a selected day keeps its marker rather
                  than hiding it under the fill. */}
              <View
                style={[
                  styles.dot,
                  hasData && styles.dotOn,
                  hasData && isSelected && styles.dotOnSelected,
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={() => {
          onSelect(today);
          onClose();
        }}
        activeOpacity={0.7}
        style={styles.todayBtn}
        accessibilityRole="button"
        accessibilityLabel="Jump to today"
      >
        <Ionicons name="today-outline" size={16} color={colors.primary} />
        <Text style={styles.todayText}>Jump to today</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  monthBtn: {
    width: layout.touch,
    height: layout.touch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  monthBtnOff: { backgroundColor: "transparent" },
  monthLabelWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  monthLabel: { ...typography.h2 },

  weekRow: { flexDirection: "row", marginBottom: spacing.xs },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
    ...numeric,
  },
  dayTextOff: { color: colors.border },
  dayTextSelected: { fontFamily: fonts.bold, color: colors.white },

  // Always laid out, only sometimes coloured — a dot that appears and
  // disappears would shift every row it is in.
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 3,
    backgroundColor: "transparent",
  },
  dotOn: { backgroundColor: colors.primary },
  dotOnSelected: { backgroundColor: colors.accent },

  todayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm - 3,
    minHeight: layout.touch,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  todayText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.primary },
});
