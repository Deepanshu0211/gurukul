import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, layout, typography } from "../theme/theme";
import { useScreenTopInset } from "../navigation/tabBarInset";
import ScreenHeader from "../components/ScreenHeader";
import { EmptyState, SectionLabel } from "../components/ui";
import { fmtDay, fmtClock } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { useAuditLog } from "../lib/audit";
import { isOversight, ROLES } from "../domain/roles";
import { STATUS_META } from "../data/mockData";

/**
 * What has been done, by whom, and to whose work.
 *
 * A teacher sees only the entries naming them — their own submissions, and
 * anyone else's action on their duties. That scope is set by RLS in
 * migrations/007, not here; this screen renders whatever comes back.
 *
 * Every line is written from the reader's point of view, because the same row
 * means two different things depending on who is looking at it: "You marked
 * Breakfast for Ajay" and "Krishna marked your Breakfast" are one database
 * row. Phrasing it neutrally ("t2 submitted duty bfast-sr") would technically
 * be true and useless to both of them.
 */

const statusText = (code) => (code ? STATUS_META[code]?.label || code : "Present");

/** Groups entries under a date heading, newest day first. */
function useGrouped(entries) {
  return useMemo(() => {
    const out = [];
    let currentDay = null;
    entries.forEach((e) => {
      const day = (e.at || "").slice(0, 10);
      if (day !== currentDay) {
        currentDay = day;
        out.push({ type: "header", id: `h-${day}`, day });
      }
      out.push({ type: "entry", id: `e-${e.id}`, entry: e });
    });
    return out;
  }, [entries]);
}

export default function ActivityScreen({ navigation }) {
  const { user } = useAuth();
  const { staffName } = useSchoolData();
  const topInset = useScreenTopInset();
  // Administrators are the only role whose policy returns routine traffic at
  // all, so they are the only ones offered the switch. For everyone else the
  // filter would be a control that never changes anything.
  const isAdmin = user?.role === ROLES.ADMIN;
  const [showRoutine, setShowRoutine] = useState(true);
  const { entries, loading, error, reload } = useAuditLog(
    isAdmin && !showRoutine ? { severity: "operational" } : {}
  );

  const rows = useGrouped(entries);
  const me = user?.id;

  /** "You" when it is the reader, the person's name otherwise. */
  const who = (id, capital = true) => {
    if (!id) return capital ? "Someone" : "someone";
    if (id === me) return capital ? "You" : "you";
    return staffName(id) || "A colleague";
  };

  const describe = (e) => {
    const mine = e.subjectId === me && e.actorId !== me;

    if (e.action === "duty_submitted") {
      // subject_id is the rostered teacher; when it differs from the actor
      // somebody covered for them.
      const covering = e.subjectId && e.subjectId !== e.actorId;
      if (!covering) {
        return {
          icon: "checkmark-circle-outline",
          tone: colors.success,
          title: `${who(e.actorId)} submitted ${e.checkpoint || "a checkpoint"}`,
          body: null,
        };
      }
      return {
        icon: "people-outline",
        tone: colors.primary,
        title: mine
          ? `${who(e.actorId)} submitted your ${e.checkpoint || "checkpoint"}`
          : `${who(e.actorId)} submitted ${e.checkpoint || "a checkpoint"} for ${who(
              e.subjectId,
              false
            )}`,
        body: mine ? "Marked on your behalf. The duty is still yours." : null,
      };
    }

    if (e.action === "attendance_override") {
      return {
        icon: "create-outline",
        tone: colors.warning,
        title: mine
          ? `${who(e.actorId)} overruled your ${e.checkpoint || "attendance"}`
          : `${who(e.actorId)} overruled ${e.checkpoint || "attendance"}`,
        body: `${e.admissionNo ? `${e.admissionNo}: ` : ""}${statusText(
          e.oldValue
        )} → ${statusText(e.newValue)}`,
      };
    }

    if (e.action === "duty_reassigned") {
      return {
        icon: "swap-horizontal-outline",
        tone: colors.info,
        title: mine
          ? `${who(e.actorId)} moved your ${e.checkpoint || "duty"} to ${who(
              e.relatedId,
              false
            )}`
          : `${who(e.actorId)} reassigned ${e.checkpoint || "a duty"}`,
        body: mine
          ? null
          : `${who(e.subjectId)} → ${who(e.relatedId, false)}`,
      };
    }

    if (e.action === "alert_resolved") {
      return {
        icon: "shield-checkmark-outline",
        tone: colors.success,
        title: `${who(e.actorId)} accounted for a student`,
        body: e.newValue,
      };
    }

    if (e.action === "profile_updated") {
      return {
        icon: "person-outline",
        tone: colors.textMuted,
        title: `${who(e.actorId)} updated ${
          e.actorId === e.subjectId ? "their" : `${who(e.subjectId, false)}'s`
        } ${e.field || "profile"}`,
        // Photo URLs are long and meaningless to read; phone numbers are the
        // point of the entry.
        body: e.field === "photo" ? null : `${e.oldValue || "not set"} → ${e.newValue || "not set"}`,
      };
    }

    if (e.action === "signed_in") {
      return {
        icon: "log-in-outline",
        tone: colors.textMuted,
        title: `${who(e.actorId)} signed in`,
        body: null,
      };
    }

    if (e.action === "role_changed" || e.action === "class_changed") {
      return {
        icon: "shield-outline",
        tone: colors.warning,
        title: `${who(e.actorId)} changed ${who(e.subjectId, false)}'s ${e.field}`,
        body: `${e.oldValue || "none"} → ${e.newValue || "none"}`,
      };
    }

    if (e.action === "staff_added" || e.action === "student_added") {
      return {
        icon: "person-add-outline",
        tone: colors.primary,
        title: `${who(e.actorId)} added ${
          e.action === "staff_added" ? who(e.subjectId, false) : `student ${e.admissionNo}`
        }`,
        body: null,
      };
    }

    // An action added by a later migration but not yet by this screen. Better
    // an honest unformatted row than a silently missing one.
    return {
      icon: "ellipse-outline",
      tone: colors.textMuted,
      title: e.action.replace(/_/g, " "),
      body: e.checkpoint,
    };
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={[styles.head, { paddingTop: topInset }]}>
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

        <ScreenHeader
          eyebrow="Activity"
          title="Log"
          subtitle={
            isOversight(user?.role)
              ? "Every submission, cover and correction across the school."
              : "Your submissions, and anything done to your duties."
          }
        />
      </View>

      {isAdmin && (
        <View style={styles.filterRow}>
          {[
            { key: true, label: "Everything" },
            { key: false, label: "Attendance only" },
          ].map((f) => (
            <TouchableOpacity
              key={String(f.key)}
              onPress={() => setShowRoutine(f.key)}
              activeOpacity={0.7}
              style={[styles.filterChip, showRoutine === f.key && styles.filterChipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: showRoutine === f.key }}
            >
              <Text
                style={[styles.filterText, showRoutine === f.key && styles.filterTextOn]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Can't load the log" body={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="Nothing yet"
          body="Submissions, cover marking and corrections appear here as they happen."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          onRefresh={reload}
          refreshing={loading}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return <SectionLabel style={styles.dayHead}>{fmtDay(item.day)}</SectionLabel>;
            }
            const e = item.entry;
            const d = describe(e);
            return (
              <View style={styles.row}>
                <View style={[styles.icon, { borderColor: d.tone }]}>
                  <Ionicons name={d.icon} size={16} color={d.tone} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.title}>{d.title}</Text>
                  {!!d.body && <Text style={typography.caption}>{d.body}</Text>}
                  <Text style={styles.time}>
                    {fmtClock(e.at)}
                    {e.day && e.day !== (e.at || "").slice(0, 10)
                      ? ` · for ${fmtDay(e.day)}`
                      : ""}
                  </Text>
                </View>
              </View>
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

  dayHead: { paddingHorizontal: layout.gutter, marginTop: spacing.md },

  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
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
  title: { ...typography.bodyStrong, fontSize: 14 },
  time: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.icon },

  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
});
