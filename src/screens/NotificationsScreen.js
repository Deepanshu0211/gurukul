import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import { EmptyState, ErrorState, SectionLabel } from "../components/ui";
import { useScreenTopInset } from "../navigation/tabBarInset";
import { useNotifications } from "../context/NotificationsContext";
import { fmtClock, fmtDay, plural } from "../utils/format";

/**
 * Every gate sign-out and sign-in, for the coordinator, MOD and admin
 * (migration 047). The place to catch up on anything missed while the phone
 * was off or the app closed — nothing here is deleted when read.
 *
 * Tapping a notice marks it read; "Mark all read" clears the badge.
 */

const FILTERS = [
  { key: "unread", label: "Unread" },
  { key: "all", label: "All" },
  { key: "student_out", label: "Signed out" },
  { key: "student_in", label: "Signed in" },
];

export default function NotificationsScreen({ navigation }) {
  const topInset = useScreenTopInset();
  const { enabled, items, unread, loading, error, refresh, markRead, markAllRead, describe } =
    useNotifications();
  const [filter, setFilter] = useState(unread ? "unread" : "all");

  const rows = useMemo(() => {
    const list = items.filter((n) => {
      if (filter === "unread") return !n.read;
      if (filter === "all") return true;
      return n.kind === filter;
    });
    const out = [];
    let current = null;
    list.forEach((n) => {
      const day = (n.at || "").slice(0, 10);
      if (day !== current) {
        current = day;
        out.push({ type: "header", id: `h-${day}`, day });
      }
      out.push({ type: "item", id: `n-${n.id}`, n });
    });
    return out;
  }, [items, filter]);

  const back = (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={layout.hitSlop}
      activeOpacity={0.7}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="arrow-back" size={20} color={colors.text} />
    </TouchableOpacity>
  );

  if (!enabled) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={[styles.head, { paddingTop: topInset }]}>{back}</View>
        <EmptyState
          icon="lock-closed-outline"
          title="Not for this account"
          body="Gate notifications go to coordinators, the MOD and administrators."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={[styles.head, { paddingTop: topInset }]}>
        {back}
        <ScreenHeader
          eyebrow="Gate"
          title="Notifications"
          subtitle={
            unread
              ? `${plural(unread, "unread notice")} · every sign-out and sign-in at the gate`
              : "Every sign-out and sign-in at the gate. You are all caught up."
          }
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}
              style={[styles.filterChip, on && styles.filterChipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.filterText, on && styles.filterTextOn]}>
                {f.key === "unread" && unread ? `Unread · ${unread}` : f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {unread > 0 && (
          <TouchableOpacity
            onPress={markAllRead}
            activeOpacity={0.7}
            style={styles.markAll}
            accessibilityRole="button"
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && !items.length ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error && !items.length ? (
        <ErrorState error={error} title="Can't load notifications" onRetry={refresh} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
          body="When anyone signs a student out of the campus or back in, it appears here."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          onRefresh={refresh}
          refreshing={loading}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return <SectionLabel style={styles.dayHead}>{fmtDay(item.day)}</SectionLabel>;
            }
            const n = item.n;
            const d = describe(n);
            const out = n.kind === "student_out";
            const tone = out ? colors.warning : colors.success;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => !n.read && markRead([n.id])}
                style={[styles.row, !n.read && styles.rowUnread]}
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? "" : "Unread. "}${d.title}. ${d.body}`}
              >
                <View style={[styles.icon, { borderColor: tone }]}>
                  <Ionicons name={out ? "exit-outline" : "enter-outline"} size={16} color={tone} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.title, !n.read && styles.titleUnread]}>{d.title}</Text>
                  <Text style={typography.caption}>{d.body}</Text>
                  <Text style={styles.time}>
                    {fmtClock(n.at)}
                    {out && n.expectedBack ? ` · expected back ${fmtDay(n.expectedBack)}` : ""}
                  </Text>
                </View>
                {!n.read && <View style={styles.dot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  back: {
    width: layout.touch,
    height: layout.touch,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm - 3,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  filterTextOn: { color: colors.white },
  markAll: { marginLeft: "auto", paddingVertical: spacing.xs + 2 },
  markAllText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.primary },

  dayHead: { paddingHorizontal: layout.gutter, marginTop: spacing.md },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowUnread: { backgroundColor: colors.card },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  title: { ...typography.body, fontSize: 14 },
  titleUnread: { ...typography.bodyStrong, fontSize: 14 },
  time: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.icon },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },

  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
});
