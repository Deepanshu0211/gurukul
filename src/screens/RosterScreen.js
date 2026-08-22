import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  typography,
  radius,
  fonts,
  layout,
  surface,
  numeric,
} from "../theme/theme";
import { useTabContentInset, useScreenTopInset } from "../navigation/tabBarInset";
import ScreenHeader from "../components/ScreenHeader";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import SearchField from "../components/SearchField";
import Segmented from "../components/Segmented";
import FadeIn from "../components/FadeIn";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import {
  SectionLabel,
  Chevron,
  TextAction,
  EmptyState,
  StatusTag,
  Row,
  ErrorState,
} from "../components/ui";
import { useNow } from "../lib/clock";
import { describeError } from "../lib/errors";
import { roleLabel, canReassign } from "../domain/roles";
import { dutyStatus, DUTY_STATUS } from "../domain/duties";
import { fmtTime, plural, initial, weekdayName} from "../utils/format";
import { useSchoolData } from "../context/SchoolDataContext";
import { useAuth } from "../context/AuthContext";
import { useStudents } from "../lib/students";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";

const TABS = [
  { key: "duties", label: "Duties", placeholder: "Search checkpoint, group or staff" },
  { key: "staff", label: "Staff", placeholder: "Search staff by name or role" },
  { key: "students", label: "Students", placeholder: "Search name, admission no. or class" },
];

export default function RosterScreen() {
  const {
    duties: DUTIES,
    staff: STAFF,
    records,
    studentsForDuty,
    reassignDuty,
    refresh,
    staffName: nameOf,
  } = useSchoolData();
  const { user } = useAuth();
  const dialog = useDialog();
  const toast = useToast();
  const now = useNow();
  const [tab, setTab] = useState("duties");
  const [query, setQuery] = useState("");
  const [reassigning, setReassigning] = useState(null);
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll, reset } = useScrolled();
  // Where the tab content starts, so the fade lands on its top edge.
  const [headerH, setHeaderH] = useState(150);

  // Each tab searches a different set, so a query carried across would show
  // "no match" against a term that was never meant for this list.
  const selectTab = (key) => {
    setTab(key);
    setQuery("");
    reset();
  };
  const placeholder = TABS.find((t) => t.key === tab)?.placeholder;

  // Reload on focus so a submission made by a teacher shows here without an
  // app restart.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const staffName = (id) => nameOf(id) || "Unassigned";
  const mayReassign = canReassign(user?.role);

  // Writes to Supabase, so the teacher losing or gaining the duty sees it
  // too — this is a today-only override; the recurring default is untouched.
  const applyReassign = async (staffId) => {
    const duty = reassigning;
    setReassigning(null);
    try {
      await reassignDuty(duty.id, staffId);
      toast.show(`${duty.checkpoint} reassigned to ${staffName(staffId)}`);
    } catch (e) {
      const shown = describeError(
        e,
        { title: "Could not reassign", message: "The duty was not reassigned. Try again." },
        null
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.offline ? shown.title : "Could not reassign",
        message: shown.message,
        destructive: !shown.offline,
      });
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View
        style={[styles.header, { paddingTop: topInset }]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setHeaderH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
        }}
      >
        <ScreenHeader title="Roster" subtitle={`${weekdayName()}, ${fmtTime(now)}`} />

        {/* Same control as the Duties scope switch — this screen used to draw
            its own, with a white selected pill instead of a teal one. */}
        <Segmented style={styles.tabs} items={TABS} value={tab} onChange={selectTab} />

        {/* Pinned, not part of the list. Inside a ListHeaderComponent it
            scrolled off on the first flick of a 415-row register, so changing
            a query meant scrolling all the way back up first. */}
        <SearchField
          key={tab}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          style={styles.search}
        />
      </View>

      {tab === "duties" && (
        <DutiesTab
          duties={DUTIES}
          records={records}
          staffName={staffName}
          studentsForDuty={studentsForDuty}
          onReassign={mayReassign ? setReassigning : null}
          bottomInset={tabInset}
          query={query}
          onScroll={onScroll}
        />
      )}
      {tab === "staff" && (
        <StaffTab
          staff={STAFF}
          duties={DUTIES}
          bottomInset={tabInset}
          query={query}
          onScroll={onScroll}
        />
      )}
      {tab === "students" && (
        <StudentsTab bottomInset={tabInset} query={query} onScroll={onScroll} />
      )}

      <EdgeFade top={headerH} visible={scrolled} />

      <BottomSheet
        visible={!!reassigning}
        onClose={() => setReassigning(null)}
        title="Reassign duty"
        subtitle={`${reassigning?.checkpoint ?? ""} · ${
          reassigning?.group ?? ""
        }. Applies to today only — the weekly default is unchanged.`}
      >
        {STAFF.map((s) => (
          <SheetOption
            key={s.id}
            label={s.name}
            hint={roleLabel(s.role)}
            active={reassigning ? s.id === reassigning.staffId : false}
            onPress={() => applyReassign(s.id)}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

function DutiesTab({
  duties,
  records,
  staffName,
  studentsForDuty,
  onReassign,
  bottomInset,
  query,
  onScroll,
}) {
  const q = query.trim().toLowerCase();
  const now = useNow();
  const withStatus = duties
    .map((d) => ({ ...d, _status: dutyStatus(d, records, now) }))
    .filter(
      (d) =>
        !q ||
        d.checkpoint.toLowerCase().includes(q) ||
        d.group.toLowerCase().includes(q) ||
        staffName(d.staffId).toLowerCase().includes(q)
    );
  const pending = withStatus.filter((d) => d._status !== DUTY_STATUS.DONE);
  const done = withStatus.filter((d) => d._status === DUTY_STATUS.DONE);

  const sections = [
    { title: "Not yet submitted", tone: "due", data: pending },
    { title: "Submitted", tone: "submitted", data: done },
  ].filter((s) => s.data.length > 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(d) => d.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      scrollEventThrottle={16}
      ListEmptyComponent={
        q ? (
          <EmptyState icon="search-outline" title="No match" body={`No duty matches “${query}”.`} compact />
        ) : (
          <EmptyState icon="calendar-outline" title="No duties today" body="Nothing is on the roster." />
        )
      }
      renderSectionHeader={({ section }) => (
        <SectionLabel count={section.data.length} tone={section.tone}>
          {section.title}
        </SectionLabel>
      )}
      renderItem={({ item, index }) => {
        const overdue = item._status === DUTY_STATUS.OVERDUE;
        const submitted = item._status === DUTY_STATUS.DONE;
        const total = studentsForDuty(item).length;
        const due = item._status === DUTY_STATUS.DUE;
        return (
          <FadeIn index={index}>
          <View style={[styles.card, overdue && styles.cardOverdue]}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleCol}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.checkpoint}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {item.group} · {plural(total, "student")}
                </Text>
              </View>
              <View style={styles.cardMeta}>
                <StatusTag
                  tone={submitted ? "submitted" : overdue ? "overdue" : due ? "due" : "pending"}
                  style={overdue ? styles.tagOnDanger : undefined}
                />
                <Text style={styles.cardTime}>
                  {fmtTime(item.start)}–{fmtTime(item.end)}
                </Text>
              </View>
            </View>

            <View style={styles.assignRow}>
              <View style={styles.assignAvatar}>
                <Text style={styles.assignAvatarText}>{initial(staffName(item.staffId))}</Text>
              </View>
              <View style={styles.assignMain}>
                <Text style={typography.label}>ASSIGNED TO</Text>
                <Text style={styles.assignName} numberOfLines={1}>
                  {staffName(item.staffId)}
                </Text>
              </View>
              {submitted ? (
                // The state is already on the card's status tag; repeating it
                // here just crowded the row. What is useful at this point is
                // why the Reassign button is gone.
                <Text style={styles.lockedText}>Locked</Text>
              ) : !onReassign ? (
                // Management and nurse can read the roster but not move a duty
                // — the database refuses it too (005's reassignment trigger).
                <Text style={styles.lockedText}>Pending</Text>
              ) : (
                <TouchableOpacity
                  style={styles.reassignBtn}
                  onPress={() => onReassign(item)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Reassign ${item.checkpoint}, ${item.group}`}
                >
                  <Text style={styles.reassignText}>Reassign</Text>
                </TouchableOpacity>
              )}
            </View>

            {overdue && (
              <View style={styles.warnRow}>
                <Ionicons name="alert-circle" size={14} color={colors.danger} />
                <Text style={styles.warnText}>Overdue — escalation sent</Text>
              </View>
            )}
          </View>
          </FadeIn>
        );
      }}
    />
  );
}

function StaffTab({ staff: STAFF, duties, bottomInset, query, onScroll }) {
  const dialog = useDialog();
  const dutiesFor = (id) => duties.filter((d) => d.staffId === id).length;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? STAFF.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          roleLabel(s.role).toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q)
      )
    : STAFF;

  return (
    <SectionList
      sections={[{ title: "", data: filtered }]}
      keyExtractor={(s) => s.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      scrollEventThrottle={16}
      ListEmptyComponent={
        <EmptyState icon="search-outline" title="No match" body={`No staff member matches “${query}”.`} compact />
      }
      renderSectionHeader={() => (
        <SectionLabel
          style={styles.countHead}
          action={
            <TextAction
              label="+ Add"
              accessibilityLabel="Add staff member"
              onPress={() =>
                dialog.alert({
                  icon: "person-add-outline",
                  title: "Add staff",
                  message: "Adding a staff member is an administrator action.",
                })
              }
            />
          }
        >
          {q ? `${filtered.length} of ${STAFF.length} staff` : `${STAFF.length} staff`}
        </SectionLabel>
      )}
      renderItem={({ item }) => {
        const n = dutiesFor(item.id);
        return (
          <Row
            style={styles.personRow}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${roleLabel(item.role)}`}
            onPress={() =>
              dialog.confirm({
                icon: "person-outline",
                title: item.name,
                message: `${roleLabel(item.role)} · ${item.email}\n\nDeactivating flags their pending duties for reassignment.`,
                cancelLabel: "Close",
                confirmLabel: "Deactivate",
                destructive: true,
              })
            }
          >
            <View style={styles.personAvatar}>
              <Text style={styles.personAvatarText}>{initial(item.name)}</Text>
            </View>
            <View style={styles.personMain}>
              <Text style={styles.personName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={typography.caption} numberOfLines={1}>
                {roleLabel(item.role)}
                {n > 0 ? ` · ${n} dut${n === 1 ? "y" : "ies"} today` : ""}
              </Text>
            </View>
            <Chevron />
          </Row>
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

function StudentsTab({ bottomInset, query, onScroll }) {
  const dialog = useDialog();
  const { students, loading, error, reload } = useStudents();

  // Stable identity, so the memoised rows below aren't invalidated on every
  // keystroke in the search field.
  const showStudent = useCallback(
    (s) =>
      dialog.alert({
        icon: "school-outline",
        title: s.name,
        message: `Admission no. ${s.adm}\nClass ${s.label} · Roll ${s.roll || "—"}\n${
          TYPE_LABEL[s.type]
        }${s.remedial ? "\nRemedial batch" : ""}`,
      }),
    [dialog]
  );

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
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.centeredText}>Loading register…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        title="Can't load the register"
        onRetry={reload}
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(s) => s.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      scrollEventThrottle={16}
      initialNumToRender={20}
      windowSize={11}
      ListHeaderComponent={
        <SectionLabel
          style={styles.countHead}
          action={
            <TextAction
              label="+ Add"
              accessibilityLabel="Add student"
              onPress={() =>
                dialog.alert({
                  icon: "person-add-outline",
                  title: "Add student",
                  message: "Add individually, or bulk-import the Excel register.",
                })
              }
            />
          }
        >
          {query ? `${filtered.length} of ${students.length}` : `${students.length} students`}
        </SectionLabel>
      }
      ListEmptyComponent={
        <EmptyState
          icon="search-outline"
          title="No match"
          body={`No student matches “${query}”.`}
          compact
        />
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.classHeader}>
          Class {section.title} · {section.data.length}
        </Text>
      )}
      renderItem={({ item }) => <StudentRow student={item} onOpen={showStudent} />}
    />
  );
}

/** 415 rows. Memoised so typing in the search box re-renders the list rather
 *  than every row inside it. */
const StudentRow = React.memo(function StudentRow({ student, onOpen }) {
  return (
    <Row
      style={styles.personRow}
      accessibilityRole="button"
      accessibilityLabel={`${student.name}, class ${student.label}, roll ${student.roll || "none"}`}
      onPress={() => onOpen(student)}
    >
      <View style={styles.rollBadge}>
        <Text style={styles.rollText}>{student.roll || "–"}</Text>
      </View>
      <View style={styles.personMain}>
        <Text style={styles.personName} numberOfLines={1}>
          {student.name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {student.adm} · {TYPE_LABEL[student.type]}
        </Text>
      </View>
      <Chevron />
    </Row>
  );
});

// The leading badge/avatar on every person row. One constant so the Staff and
// Students tabs put their names at exactly the same left edge.
const LEAD = 38;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xs },

  tabs: { marginTop: spacing.sm },

  list: { paddingHorizontal: layout.gutter },
  classHeader: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  search: { marginTop: spacing.sm },

  // SectionLabel's default 24pt top margin is for separating groups down a
  // scrolling page — "Your details" from "Security". These two headers are
  // not separating anything: they sit directly under the pinned search field
  // and only carry a count and an action, so the default opened a band of
  // empty background between the field and the first row.
  countHead: { marginTop: spacing.sm },

  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 64, gap: spacing.sm },
  centeredText: { ...typography.caption, fontSize: 13, textAlign: "center" },

  card: {
    ...surface.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardOverdue: { borderColor: colors.danger, borderWidth: 1.5 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitleCol: { flex: 1, minWidth: 0, gap: 1 },
  cardTitle: { ...typography.h2 },
  // State on top, window underneath: a coordinator scanning the roster asks
  // "is it in?" before "when was it?".
  cardMeta: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  tagOnDanger: { backgroundColor: colors.white },
  cardTime: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    ...numeric,
  },

  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    marginTop: spacing.md - 4,
    paddingTop: spacing.md - 4,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.divider,
  },
  assignAvatar: {
    width: LEAD,
    height: LEAD,
    borderRadius: LEAD / 2,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  assignAvatarText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.text },
  assignMain: { flex: 1, minWidth: 0, gap: 1 },
  assignName: { ...typography.body, fontFamily: fonts.medium },
  reassignBtn: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  reassignText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.primary },
  lockedText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    flexShrink: 0,
  },

  warnRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  warnText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.danger },

  personRow: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    borderRadius: radius.md,
    minHeight: layout.row,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  personAvatar: {
    width: LEAD,
    height: LEAD,
    borderRadius: LEAD / 2,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.text },
  personMain: { flex: 1, minWidth: 0, gap: 1 },
  personName: { ...typography.bodyStrong },
  rollBadge: {
    width: LEAD,
    height: LEAD,
    borderRadius: LEAD / 2,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rollText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    ...numeric,
  },
});
