import React from "react";
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius } from "../theme/theme";
import { Card, Pill, PrimaryButton } from "../components/ui";
import { DUTIES, fmtTime, dutyStatus, studentsForDuty } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

const STATUS_TONE = { done: "success", overdue: "danger", due: "warning", upcoming: "neutral" };
const STATUS_LABEL = { done: "Submitted", overdue: "Overdue", due: "Due now", upcoming: "Upcoming" };
const ACCENT_COLOR = { done: colors.success, overdue: colors.danger, due: colors.warning, upcoming: "transparent" };

const pluralize = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function DutiesScreen({ navigation }) {
  const { user } = useAuth();
  const { records } = useAttendance();

  const isStaffScoped = user.role === "teacher";
  const duties = isStaffScoped ? DUTIES.filter((d) => d.staffId === user.id) : DUTIES;

  const needsAttention = duties.filter((d) => ["due", "overdue"].includes(dutyStatus(d, records)));
  const later = duties.filter((d) => dutyStatus(d, records) === "upcoming");
  const completed = duties.filter((d) => dutyStatus(d, records) === "done");

  const sections = [
    { title: "Needs attention", data: needsAttention },
    { title: "Later today", data: later },
    { title: "Completed", data: completed },
  ].filter((s) => s.data.length > 0);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={typography.h1}>{isStaffScoped ? "My Duties" : "Today's Duties"}</Text>
        <Text style={typography.caption}>Friday · {fmtTime(7 * 60 + 42)}</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 4 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={[typography.label, styles.sectionHeader]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => {
          const status = dutyStatus(item, records);
          const count = studentsForDuty(item).length;
          const actionable = status === "due" || status === "overdue";

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("DutyMarking", { dutyId: item.id })}
            >
              <Card
                style={[
                  styles.card,
                  { borderLeftWidth: 4, borderLeftColor: ACCENT_COLOR[status] },
                  status === "done" && styles.doneCard,
                ]}
              >
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h3}>{item.checkpoint}</Text>
                    <Text style={typography.caption}>
                      {item.group} · {pluralize(count, "student")}
                    </Text>
                    <Text style={[typography.caption, { marginTop: 2 }]}>
                      {fmtTime(item.start)} – {fmtTime(item.end)}
                    </Text>
                  </View>
                  <Pill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
                </View>

                {actionable ? (
                  <PrimaryButton
                    title="Mark attendance"
                    onPress={() => navigation.navigate("DutyMarking", { dutyId: item.id })}
                    style={{ marginTop: spacing.sm, paddingVertical: 10 }}
                  />
                ) : (
                  <View style={styles.footerRow}>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sectionHeader: { marginTop: spacing.md, marginBottom: 6 },
  card: { marginBottom: 10 },
  doneCard: { opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
});