import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import { DUTIES, STAFF, ROLE_LABELS, NOW, studentsForDuty } from "../data/mockData";
import { dutyStatus, DUTY_STATUS } from "../domain/duties";
import { fmtTime, plural, initial } from "../utils/format";
import { useAttendance } from "../context/AttendanceContext";
import { useStudents } from "../lib/students";
import { useDialog } from "../components/Dialog";

const TABS = [
  { key: "duties", label: "Duties" },
  { key: "staff", label: "Staff" },
  { key: "students", label: "Students" },
];

export default function RosterScreen() {
  const { records } = useAttendance();
  const [tab, setTab] = useState("duties");

  // Per-day overrides live here for now; defaults stay untouched (SRS B2).
  const [assignments, setAssignments] = useState(
    Object.fromEntries(DUTIES.map((d) => [d.id, d.staffId]))
  );
  const [reassigning, setReassigning] = useState(null);

  const staffById = (id) => STAFF.find((s) => s.id === id);
  const staffName = (id) => staffById(id)?.name || "Unassigned";

  const applyReassign = (staffId) => {
    setAssignments((prev) => ({ ...prev, [reassigning.id]: staffId }));
    setReassigning(null);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Roster</Text>
        <Text style={typography.caption}>Friday, {fmtTime(NOW)}</Text>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === "duties" && (
        <DutiesTab
          assignments={assignments}
          records={records}
          staffName={staffName}
          onReassign={setReassigning}
        />
      )}
      {tab === "staff" && <StaffTab assignments={assignments} />}
      {tab === "students" && <StudentsTab />}

      <Modal
        visible={!!reassigning}
        transparent
        animationType="slide"
        onRequestClose={() => setReassigning(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setReassigning(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>Reassign duty</Text>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            {reassigning?.checkpoint} · {reassigning?.group}. Applies to today only — the weekly
            default is unchanged.
          </Text>
          <ScrollableStaff
            current={reassigning ? assignments[reassigning.id] : null}
            onPick={applyReassign}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DutiesTab({ assignments, records, staffName, onReassign }) {
  const withStatus = DUTIES.map((d) => ({ ...d, _status: dutyStatus(d, records, NOW) }));
  const pending = withStatus.filter((d) => d._status !== DUTY_STATUS.DONE);
  const done = withStatus.filter((d) => d._status === DUTY_STATUS.DONE);

  const sections = [
    { title: "Not yet submitted", data: pending },
    { title: "Submitted", data: done },
  ].filter((s) => s.data.length > 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(d) => d.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
          <Text style={styles.sectionCount}>{section.data.length}</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const overdue = item._status === DUTY_STATUS.OVERDUE;
        const submitted = item._status === DUTY_STATUS.DONE;
        const total = studentsForDuty(item).length;
        return (
          <View style={[styles.card, overdue && styles.cardOverdue]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.checkpoint}</Text>
                <Text style={typography.caption}>
                  {item.group} · {total} student{total === 1 ? "" : "s"}
                </Text>
              </View>
              <Text style={styles.cardTime}>
                {fmtTime(item.start)}–{fmtTime(item.end)}
              </Text>
            </View>

            <View style={styles.assignRow}>
              <View style={styles.assignAvatar}>
                <Text style={styles.assignAvatarText}>{staffName(item.staffId).charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assignLabel}>ASSIGNED TO</Text>
                <Text style={styles.assignName}>{staffName(assignments[item.id])}</Text>
              </View>
              {submitted ? (
                <View style={styles.doneTag}>
                  <Ionicons name="checkmark" size={12} color={colors.success} />
                  <Text style={styles.doneTagText}>Submitted</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.reassignBtn}
                  onPress={() => onReassign(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reassignText}>Reassign</Text>
                </TouchableOpacity>
              )}
            </View>

            {overdue && (
              <View style={styles.warnRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={styles.warnText}>Overdue — escalation sent</Text>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

function StaffTab({ assignments }) {
  const dialog = useDialog();
  const dutiesFor = (id) => Object.values(assignments).filter((v) => v === id).length;
  return (
    <SectionList
      sections={[{ title: "", data: STAFF }]}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderSectionHeader={() => (
        <View style={styles.listHeaderRow}>
          <Text style={styles.sectionLabel}>{STAFF.length} STAFF</Text>
          <TouchableOpacity
            onPress={() =>
              dialog.alert({
                icon: "person-add-outline",
                title: "Add staff",
                message: "Adding a staff member is an administrator action.",
              })
            }
            hitSlop={8}
          >
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>
      )}
      renderItem={({ item }) => {
        const n = dutiesFor(item.id);
        return (
          <TouchableOpacity
            style={styles.personRow}
            activeOpacity={0.6}
            onPress={() =>
              dialog.confirm({
                icon: "person-outline",
                title: item.name,
                message: `${ROLE_LABELS[item.role]} · ${item.email}\n\nDeactivating flags their pending duties for reassignment.`,
                cancelLabel: "Close",
                confirmLabel: "Deactivate",
                destructive: true,
              })
            }
          >
            <View style={styles.personAvatar}>
              <Text style={styles.personAvatarText}>{item.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{item.name}</Text>
              <Text style={typography.caption}>
                {ROLE_LABELS[item.role]}
                {n > 0 ? ` · ${n} dut${n === 1 ? "y" : "ies"} today` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.border} />
          </TouchableOpacity>
        );
      }}
    />
  );
}

const TYPE_LABEL = {
  R: "Residential",
  D: "Day scholar",
  V: "Vedic school",
  B: "Day boarding",
};

function StudentsTab() {
  const dialog = useDialog();
  const { students, loading, error, reload } = useStudents();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.adm.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q)
    );
  }, [students, query]);

  const sections = useMemo(() => {
    const byClass = filtered.reduce((acc, s) => {
      (acc[s.label] = acc[s.label] || []).push(s);
      return acc;
    }, {});
    return Object.entries(byClass)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([label, data]) => ({ title: label, data }));
  }, [filtered]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.centeredText}>Loading register…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.textMuted} />
        <Text style={styles.centeredText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={reload} activeOpacity={0.8}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={20}
      windowSize={11}
      ListHeaderComponent={
        <View>
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionLabel}>
              {query ? `${filtered.length} OF ${students.length}` : `${students.length} STUDENTS`}
            </Text>
            <TouchableOpacity
              onPress={() =>
                dialog.alert({
                  icon: "person-add-outline",
                  title: "Add student",
                  message: "Add individually, or bulk-import the Excel register.",
                })
              }
              hitSlop={8}
            >
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, admission no. or class"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.centeredText}>No student matches “{query}”.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.classHeader}>
          Class {section.title} · {section.data.length}
        </Text>
      )}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.personRow}
          activeOpacity={0.6}
          onPress={() =>
            dialog.alert({
              icon: "school-outline",
              title: item.name,
              message: `Admission no. ${item.adm}\nClass ${item.label} · Roll ${item.roll || "—"}\n${
                TYPE_LABEL[item.type]
              }${item.remedial ? "\nRemedial batch" : ""}`,
            })
          }
        >
          <View style={styles.rollBadge}>
            <Text style={styles.rollText}>{item.roll || "–"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.personName}>{item.name}</Text>
            <Text style={typography.caption}>
              {item.adm} · {TYPE_LABEL[item.type]}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.border} />
        </TouchableOpacity>
      )}
    />
  );
}

function ScrollableStaff({ current, onPick }) {
  return (
    <View>
      {STAFF.map((s) => {
        const active = s.id === current;
        return (
          <TouchableOpacity
            key={s.id}
            style={[styles.pickRow, active && styles.pickRowActive]}
            onPress={() => onPick(s.id)}
            activeOpacity={0.7}
          >
            <View style={styles.personAvatar}>
              <Text style={styles.personAvatarText}>{s.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{s.name}</Text>
              <Text style={typography.caption}>{ROLE_LABELS[s.role]}</Text>
            </View>
            {active && <Ionicons name="checkmark-circle" size={19} color={colors.text} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 2 },
  pageTitle: { fontFamily: fonts.bold, fontSize: 28, color: colors.text, letterSpacing: -0.4 },

  tabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  tabActive: { backgroundColor: colors.card },
  tabText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  tabTextActive: { color: colors.text },

  list: { paddingHorizontal: spacing.md, paddingBottom: 48 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 1.3, color: colors.textMuted },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 11, color: colors.border },
  addLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  classHeader: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: 6,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: spacing.xs,
  },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text, padding: 0 },

  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 64, gap: 10 },
  centeredText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 260,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.text,
  },
  retryText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 8,
  },
  cardOverdue: { borderColor: colors.danger, borderWidth: 1.5 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginBottom: 1 },
  cardTime: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },

  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  assignAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  assignAvatarText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  assignLabel: { fontFamily: fonts.semibold, fontSize: 9.5, letterSpacing: 1, color: colors.textMuted },
  assignName: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  reassignBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.text,
  },
  reassignText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text },
  doneTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  doneTagText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.success },

  warnRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  warnText: { fontFamily: fonts.medium, fontSize: 12, color: colors.danger },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  personName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  rollBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rollText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: "80%",
  },
  sheetGrip: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.text },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 5,
  },
  pickRowActive: { borderColor: colors.text, backgroundColor: colors.cardAlt },
});
