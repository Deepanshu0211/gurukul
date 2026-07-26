import React from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius } from "../theme/theme";
import { Card, Pill } from "../components/ui";
import { DUTIES, fmtTime, dutyStatus, studentsForDuty } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

const STATUS_TONE = { done: "success", overdue: "danger", due: "warning", upcoming: "neutral" };
const STATUS_LABEL = { done: "Submitted", overdue: "Overdue", due: "Due now", upcoming: "Upcoming" };

export default function DutiesScreen({ navigation }) {
  const { user } = useAuth();
  const { records } = useAttendance();

  const isStaffScoped = user.role === "teacher";
  const duties = isStaffScoped ? DUTIES.filter((d) => d.staffId === user.id) : DUTIES;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={typography.h1}>{isStaffScoped ? "My Duties" : "Today's Duties"}</Text>
        <Text style={typography.caption}>Friday · {fmtTime(7 * 60 + 42)}</Text>
      </View>

      <FlatList
        data={duties}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: spacing.md, gap: 10 }}
        renderItem={({ item }) => {
          const status = dutyStatus(item, records);
          const count = studentsForDuty(item).length;
          return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate("DutyMarking", { dutyId: item.id })}>
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h3}>{item.checkpoint}</Text>
                    <Text style={typography.caption}>{item.group} · {count} students</Text>
                    <Text style={[typography.caption, { marginTop: 2 }]}>
                      {fmtTime(item.start)} – {fmtTime(item.end)}
                    </Text>
                  </View>
                  <Pill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
                </View>
                <View style={styles.footerRow}>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
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
  row: { flexDirection: "row", alignItems: "flex-start" },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
});
