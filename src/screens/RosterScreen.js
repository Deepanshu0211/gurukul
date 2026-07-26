import React from "react";
import { View, Text, StyleSheet, FlatList, SafeAreaView } from "react-native";
import { colors, spacing, typography } from "../theme/theme";
import { Card, Pill } from "../components/ui";
import { DUTIES, STAFF, fmtTime } from "../data/mockData";

export default function RosterScreen() {
  const staffName = (id) => STAFF.find((s) => s.id === id)?.name || "Unassigned";

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={typography.h1}>Duty Roster</Text>
        <Text style={typography.caption}>Reassign staff for today's checkpoints</Text>
      </View>
      <FlatList
        data={DUTIES}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: spacing.md, gap: 10 }}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>{item.checkpoint}</Text>
                <Text style={typography.caption}>{item.group}</Text>
                <Text style={[typography.caption, { marginTop: 2 }]}>{fmtTime(item.start)} – {fmtTime(item.end)}</Text>
              </View>
              <Pill label={staffName(item.staffId)} tone="primary" />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
