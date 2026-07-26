import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius } from "../theme/theme";
import { Card, PrimaryButton, Pill } from "../components/ui";
import { DUTIES, STATUS_META, fmtTime, studentsForDuty } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

export default function DutyMarkingScreen({ route, navigation }) {
  const { dutyId } = route.params;
  const duty = DUTIES.find((d) => d.id === dutyId);
  const students = useMemo(() => studentsForDuty(duty), [duty]);
  const { user } = useAuth();
  const { records, submitDuty } = useAttendance();
  const existing = records[dutyId];
  const readOnly = !!existing;
  const [statuses, setStatuses] = useState(existing ? existing.statuses : {});

  const cycleStatus = (studentId) => {
    if (readOnly) return;
    setStatuses((prev) => {
      const next = { ...prev };
      if (next[studentId] === "A") delete next[studentId];
      else next[studentId] = "A";
      return next;
    });
  };

  const setOther = (studentId, code) => {
    if (readOnly) return;
    setStatuses((prev) => {
      const next = { ...prev };
      if (code === "P") delete next[studentId];
      else next[studentId] = code;
      return next;
    });
  };

  const present = students.length - Object.keys(statuses).length;
  const absent = Object.values(statuses).filter((s) => s === "A").length;

  const handleSubmit = () => {
    submitDuty(dutyId, statuses, user.id);
    Alert.alert("Submitted", `${duty.checkpoint} · ${present}/${students.length} present, ${absent} absent. Summary sent to Coordinator, MOD & Principal.`);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={typography.h3}>{duty.checkpoint}</Text>
          <Text style={typography.caption}>{duty.group} · {students.length} students</Text>
        </View>
        {readOnly && <Pill label="Locked" tone="neutral" />}
      </View>

      <FlatList
        data={students}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.md, gap: 8, paddingBottom: 140 }}
        renderItem={({ item }) => {
          const st = statuses[item.id];
          return (
            <Card style={[styles.studentRow, st === "A" && { backgroundColor: colors.dangerBg }, st && st !== "A" && { backgroundColor: colors.warningBg }]}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => cycleStatus(item.id)} disabled={readOnly}>
                <Text style={typography.h3}>{item.name}</Text>
                <Text style={typography.caption}>{item.label} · Roll {item.roll} · {item.type === "D" ? "Day scholar" : "Residential"}</Text>
              </TouchableOpacity>
              <View style={styles.statusButtons}>
                <StatusPicker current={st} onSelect={(code) => setOther(item.id, code)} disabled={readOnly} />
              </View>
            </Card>
          );
        }}
      />

      <View style={styles.footer}>
        <Text style={typography.body}>
          Present <Text style={{ fontWeight: "700" }}>{present}</Text> · Absent{" "}
          <Text style={{ fontWeight: "700", color: colors.danger }}>{absent}</Text>
        </Text>
        {!readOnly && <PrimaryButton title="Submit Attendance" onPress={handleSubmit} style={{ width: 180 }} />}
      </View>
    </SafeAreaView>
  );
}

function StatusPicker({ current, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const label = current ? STATUS_META[current].label : "Present";
  const color = current ? STATUS_META[current].color : colors.success;

  return (
    <View>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.statusChip, { backgroundColor: color + "22" }]}
      >
        <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        {!disabled && <Ionicons name="chevron-down" size={12} color={color} style={{ marginLeft: 4 }} />}
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdown}>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { onSelect("P"); setOpen(false); }}>
            <Text style={{ color: colors.success, fontWeight: "600" }}>Present</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { onSelect("A"); setOpen(false); }}>
            <Text style={{ color: colors.danger, fontWeight: "600" }}>Absent</Text>
          </TouchableOpacity>
          {Object.entries(STATUS_META).filter(([k]) => k !== "A").map(([k, v]) => (
            <TouchableOpacity key={k} style={styles.dropdownItem} onPress={() => { onSelect(k); setOpen(false); }}>
              <Text style={{ color: v.color, fontWeight: "600" }}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardAlt },
  studentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusButtons: { marginLeft: spacing.sm },
  statusChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  dropdown: {
    position: "absolute",
    top: 34,
    right: 0,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 6,
    minWidth: 130,
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dropdownItem: { paddingVertical: 8, paddingHorizontal: 8 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
