import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import { PrimaryButton } from "../components/ui";
import { DUTIES, STATUS_META, studentsForDuty } from "../data/mockData";
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
  // Which student's status sheet is open — null when closed.
  const [sheetFor, setSheetFor] = useState(null);

  const toggleAbsent = (studentId) => {
    if (readOnly) return;
    setStatuses((prev) => {
      const next = { ...prev };
      if (next[studentId] === "A") delete next[studentId];
      else next[studentId] = "A";
      return next;
    });
  };

  const setStatus = (studentId, code) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (code === "P") delete next[studentId];
      else next[studentId] = code;
      return next;
    });
    setSheetFor(null);
  };

  const marked = Object.keys(statuses).length;
  const present = students.length - marked;
  const absent = Object.values(statuses).filter((s) => s === "A").length;
  const elsewhere = marked - absent;

  const handleSubmit = () => {
    submitDuty(dutyId, statuses, user.id);
    Alert.alert(
      "Submitted",
      `${duty.checkpoint} · ${present}/${students.length} present, ${absent} absent. Summary sent to Coordinator, MOD & Principal.`
    );
    navigation.goBack();
  };

  const confirmSubmit = () => {
    if (absent > 0) {
      Alert.alert(
        `${absent} student${absent === 1 ? "" : "s"} marked absent`,
        "Absent means the child is unaccounted for and will raise a safety alert. Submit anyway?",
        [
          { text: "Review", style: "cancel" },
          { text: "Submit", style: "destructive", onPress: handleSubmit },
        ]
      );
    } else {
      handleSubmit();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.headerTitle}>{duty.checkpoint}</Text>
          <Text style={typography.caption}>
            {duty.group} · {students.length} student{students.length === 1 ? "" : "s"}
          </Text>
        </View>
        {readOnly && (
          <View style={styles.lockedPill}>
            <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
            <Text style={styles.lockedText}>Locked</Text>
          </View>
        )}
      </View>

      {!readOnly && (
        <Text style={styles.hint}>
          Everyone starts <Text style={styles.hintStrong}>Present</Text> — tap a name to mark
          absent, or tap the status to choose another.
        </Text>
      )}

      <FlatList
        data={students}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const code = statuses[item.id];
          const isAbsent = code === "A";
          const meta = code ? STATUS_META[code] : null;

          return (
            <View style={[styles.row, isAbsent && styles.rowAbsent, code && !isAbsent && styles.rowElsewhere]}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => toggleAbsent(item.id)}
                disabled={readOnly}
                activeOpacity={0.6}
              >
                <Text style={styles.name}>{item.name}</Text>
                <Text style={typography.caption}>
                  {item.label} · Roll {item.roll} · {item.type === "D" ? "Day scholar" : "Residential"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => !readOnly && setSheetFor(item)}
                disabled={readOnly}
                style={[
                  styles.statusChip,
                  isAbsent && styles.statusChipAbsent,
                  code && !isAbsent && styles.statusChipElsewhere,
                ]}
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    isAbsent && { color: colors.danger },
                    code && !isAbsent && { color: colors.text },
                  ]}
                >
                  {meta ? meta.label : "Present"}
                </Text>
                {!readOnly && (
                  <Ionicons
                    name="chevron-down"
                    size={11}
                    color={isAbsent ? colors.danger : colors.textMuted}
                    style={{ marginLeft: 3 }}
                  />
                )}
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <View style={styles.tallies}>
          <Tally value={present} label="Present" />
          <Tally value={elsewhere} label="Elsewhere" />
          <Tally value={absent} label="Absent" danger />
        </View>
        {!readOnly && (
          <PrimaryButton title="Submit" onPress={confirmSubmit} style={styles.submitBtn} />
        )}
      </View>

      {/* Status picker as a bottom sheet — a Modal renders above everything,
          unlike the old inline dropdown which got clipped by adjacent rows. */}
      <Modal
        visible={!!sheetFor}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetFor(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheetFor(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>{sheetFor?.name}</Text>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            Where is this student?
          </Text>

          <SheetOption
            label="Present"
            hint="At this checkpoint"
            active={sheetFor && !statuses[sheetFor.id]}
            onPress={() => setStatus(sheetFor.id, "P")}
          />
          <SheetOption
            label="Absent"
            hint="Whereabouts unknown — raises an alert"
            danger
            active={sheetFor && statuses[sheetFor.id] === "A"}
            onPress={() => setStatus(sheetFor.id, "A")}
          />
          {Object.entries(STATUS_META)
            .filter(([k]) => k !== "A")
            .map(([k, v]) => (
              <SheetOption
                key={k}
                label={v.label}
                hint="Accounted for"
                active={sheetFor && statuses[sheetFor.id] === k}
                onPress={() => setStatus(sheetFor.id, k)}
              />
            ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Tally({ value, label, danger }) {
  return (
    <View style={styles.tally}>
      <Text style={[styles.tallyValue, danger && value > 0 && { color: colors.danger }]}>
        {value}
      </Text>
      <Text style={styles.tallyLabel}>{label}</Text>
    </View>
  );
}

function SheetOption({ label, hint, active, danger, onPress }) {
  return (
    <TouchableOpacity style={[styles.sheetOption, active && styles.sheetOptionActive]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sheetOptionLabel, danger && { color: colors.danger }]}>{label}</Text>
        <Text style={typography.caption}>{hint}</Text>
      </View>
      {active && <Ionicons name="checkmark-circle" size={20} color={colors.text} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  lockedText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted },

  hint: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    lineHeight: 18,
  },
  hintStrong: { fontFamily: fonts.bold, color: colors.text },

  list: { paddingHorizontal: spacing.md, paddingBottom: 130, gap: 8 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  // Absent is the one state that must be impossible to miss.
  rowAbsent: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  rowElsewhere: { backgroundColor: colors.cardAlt },
  rowMain: { flex: 1, marginRight: spacing.sm },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginBottom: 1 },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipAbsent: { borderColor: colors.danger, backgroundColor: colors.white },
  statusChipElsewhere: { borderColor: colors.textMuted, backgroundColor: colors.white },
  statusChipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tallies: { flexDirection: "row", gap: spacing.lg },
  tally: { alignItems: "flex-start" },
  tallyValue: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  tallyLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  submitBtn: { paddingHorizontal: 34, paddingVertical: 13, borderRadius: radius.pill },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetGrip: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 6,
  },
  sheetOptionActive: { borderColor: colors.text, backgroundColor: colors.cardAlt },
  sheetOptionLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
