import React from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius } from "../theme/theme";
import { Card, Pill, IconCircle } from "../components/ui";
import { DUTIES, STUDENTS, ALERTS, dutyStatus } from "../data/mockData";
import { useAttendance } from "../context/AttendanceContext";

const ALERT_TONE = { OK: "success", ALERT: "danger", OVERDUE: "warning" };

export default function DashboardScreen() {
  const { records } = useAttendance();
  const submitted = DUTIES.filter((d) => dutyStatus(d, records) === "done").length;
  const overdue = DUTIES.filter((d) => dutyStatus(d, records) === "overdue").length;

  const stats = [
    { label: "Students", value: STUDENTS.length, icon: "people-outline", bg: "#ECE9FD", fg: colors.primary },
    { label: "Duties submitted", value: `${submitted}/${DUTIES.length}`, icon: "checkmark-done-outline", bg: colors.successBg, fg: colors.success },
    { label: "Overdue", value: overdue, icon: "alert-circle-outline", bg: colors.dangerBg, fg: colors.danger },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 }}>
        <Text style={typography.h1}>Overview</Text>
        <Text style={typography.caption}>Bhaktivedanta Gurukula · Friday</Text>

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <Card key={s.label} style={styles.statCard}>
              <IconCircle bg={s.bg} size={40}>
                <Ionicons name={s.icon} size={20} color={s.fg} />
              </IconCircle>
              <Text style={[typography.h2, { marginTop: 8 }]}>{s.value}</Text>
              <Text style={typography.caption}>{s.label}</Text>
            </Card>
          ))}
        </View>

        <Text style={[typography.h2, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Live alerts</Text>
        <View style={{ gap: 8 }}>
          {ALERTS.map((a) => (
            <Card key={a.id} style={styles.alertRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{a.text}</Text>
                <Text style={typography.caption}>{a.time}</Text>
              </View>
              <Pill label={a.kind} tone={ALERT_TONE[a.kind]} />
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  statsRow: { flexDirection: "row", gap: 10, marginTop: spacing.md },
  statCard: { flex: 1, alignItems: "flex-start" },
  alertRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
