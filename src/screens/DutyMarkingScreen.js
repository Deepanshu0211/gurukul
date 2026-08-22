import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  typography,
  radius,
  fonts,
  layout,
  surface,
  shadow,
  numeric,
} from "../theme/theme";
import { PrimaryButton, Pill, EmptyState, SecondaryButton, Row } from "../components/ui";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import SearchField from "../components/SearchField";
import { useScreenTopInset } from "../navigation/tabBarInset";
import { STATUS_META } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { canOverride } from "../domain/roles";
import { useSchoolData } from "../context/SchoolDataContext";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { haptics } from "../lib/haptics";
import { plural } from "../utils/format";
import { describeError } from "../lib/errors";

/**
 * Marking one checkpoint.
 *
 * The interaction is built around the fact that almost everybody is present:
 * the teacher is hunting for the two or three exceptions in a line of up to
 * 300 children, usually one-handed, often before sunrise.
 *
 *  - Every row carries an explicit ✓ / ✕ pair rather than a hidden toggle, so
 *    the current state is visible without reading and either answer is one
 *    tap. The previous version toggled on a tap anywhere in the row, which
 *    meant a mis-tap while scrolling silently marked a child absent.
 *  - A colour stripe down the left edge makes the exceptions findable when
 *    scrolling back to check the count.
 *  - Tapping the name opens the full status list (Home, Sick, Outing …).
 *  - Search appears once the group is too long to scan, which is the
 *    residential meal and night checkpoints.
 */

// Rows are a fixed height so the list can be virtualised without measuring.
// Both text lines are single-line, which is what makes the height reliable.
const ROW_H = 68;
const ROW_GAP = spacing.sm;
// Below this a group fits in a screenful or two and a search field is just
// another thing in the way. A single class section (20–40) is already past the
// point where finding one name means thumbing the whole list, so this sits
// well under the residential-group sizes it was originally written for.
const SEARCH_THRESHOLD = 15;

const keyExtractor = (s) => s.id;
const getItemLayout = (_, index) => ({
  length: ROW_H + ROW_GAP,
  offset: (ROW_H + ROW_GAP) * index,
  index,
});

// Presentation copy for the status picker. Lives here rather than in
// mockData because it describes the choice to a teacher, not the record.
const STATUS_HINT = {
  H: "Signed out to family",
  S: "Unwell — sick bay or home",
  V: "At a school activity",
  O: "On an approved outing",
  G: "At Gita Nagari",
  Y: "In supervised self study",
};

export default function DutyMarkingScreen({ route, navigation }) {
  const { dutyId } = route.params;
  const { user } = useAuth();
  const { duties, records, studentsForDuty, submitDuty, overrideDuty, staffName } =
    useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll } = useScrolled();

  const duty = duties.find((d) => d.id === dutyId);
  const students = useMemo(() => studentsForDuty(duty), [duty, studentsForDuty]);

  const existing = records[dutyId];
  // A submitted record is final for the teacher who marked it. Oversight
  // roles may amend it (SRS A6) — the same screen, deliberately, so a
  // correction is made against the same list the teacher saw rather than a
  // stripped-down form that hides the rest of the group.
  const submitted = duty?.state === "submitted";
  const isOverride = submitted && canOverride(user?.role);
  const readOnly = submitted && !isOverride;

  const [statuses, setStatuses] = useState(existing ? existing.statuses : {});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  // Which student's status sheet is open — null when closed.
  const [sheetFor, setSheetFor] = useState(null);
  // Measured rather than hardcoded: the footer is two rows tall when the
  // Submit button is showing and one when the duty is locked, and a fixed
  // padding left the last student either buried or floating.
  const [footerH, setFooterH] = useState(96);
  // Where the list starts, so the fade can sit exactly on its top edge.
  const [chromeH, setChromeH] = useState(140);

  // A ref, so these handlers keep a stable identity across renders. Passing a
  // fresh closure into 300 memoised rows re-renders every one of them on each
  // change of state.
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const setStatus = useCallback((studentId, code) => {
    if (code === "A") haptics.markAbsent();
    else if (statusesRef.current[studentId] === "A") haptics.undoAbsent();
    else haptics.select();

    setStatuses((prev) => {
      const next = { ...prev };
      if (code === "P") delete next[studentId];
      else next[studentId] = code;
      return next;
    });
    setSheetFor(null);
  }, []);

  const openSheet = useCallback((student) => setSheetFor(student), []);

  const searchable = students.length > SEARCH_THRESHOLD;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || String(s.roll || "").includes(q)
    );
  }, [students, query]);

  const marked = Object.keys(statuses).length;
  const present = students.length - marked;
  const absent = Object.values(statuses).filter((s) => s === "A").length;
  const elsewhere = marked - absent;

  // Cover marking: anyone may submit a pending checkpoint, and the duty stays
  // assigned to whoever it was rostered to. `submitted_by` records who really
  // did it, so this has to be said on screen — a teacher must never submit a
  // colleague's list thinking it was their own class.
  // Who the record belongs to, and what this correction would actually change
  // against it. The count drives both the confirmation and whether Save is
  // worth offering: reopening a record and changing nothing must not write a
  // correction, stamp `corrected_by`, or raise an audit entry.
  const markedBy = staffName(existing?.submittedBy);
  const changedCount = useMemo(() => {
    if (!isOverride) return 0;
    const before = existing?.statuses || {};
    const touched = new Set([...Object.keys(before), ...Object.keys(statuses)]);
    let n = 0;
    touched.forEach((id) => {
      if ((statuses[id] || null) !== (before[id] || null)) n += 1;
    });
    return n;
  }, [isOverride, existing, statuses]);

  const covering = !!duty && duty.staffId !== user?.id;
  // Falls back to a generic phrase — the warning matters more than the name,
  // and a duty can outlive the staff row it points at.
  const coveringFor = covering ? staffName(duty.staffId) || "another teacher" : null;

  // The duty can be missing if it was reassigned or removed while this screen
  // was open — better an honest message than a crash on `duty.checkpoint`.
  if (!duty) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Duty not available"
          body="It may have been reassigned. Go back and pull to refresh."
          action={
            <SecondaryButton
              title="Back to duties"
              onPress={() => navigation.goBack()}
              style={{ marginTop: spacing.sm }}
            />
          }
        />
      </SafeAreaView>
    );
  }

  const handleOverride = async () => {
    setSaving(true);
    try {
      const changed = await overrideDuty(dutyId, statuses, user.id);
      haptics.success();
      toast.show(
        changed === 0
          ? "No changes to save"
          : `${plural(changed, "mark")} amended in ${duty.checkpoint}`
      );
      navigation.goBack();
    } catch (e) {
      const shown = describeError(
        e,
        { title: "Not saved", message: "Something went wrong while saving this amendment. Your changes have been kept." },
        "Your changes have been kept. Try again when you have signal."
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.offline ? shown.title : "Not saved",
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmOverride = () => {
    // Never silent, and never one tap. This overwrites a colleague's finished
    // record, and the person doing it is senior enough that nobody downstream
    // will question it — so the stop has to happen here.
    haptics.warn();
    dialog.confirm({
      icon: "create-outline",
      title: markedBy ? `Overrule ${markedBy}'s submission?` : "Overrule this submission?",
      message: `This will change ${plural(changedCount, "mark")} in ${
        duty.checkpoint
      }. The original submitter remains on the record, and this amendment will be attributed to you.`,
      cancelLabel: "Review",
      confirmLabel: "Save correction",
      destructive: true,
      onConfirm: handleOverride,
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await submitDuty(dutyId, statuses, user.id);
      haptics.success();
      // A toast, not a dialog. Submitting is the last step of a round and the
      // teacher is already walking to the next checkpoint — a modal they have
      // to dismiss first is a tap for nothing.
      toast.show(
        `${duty.checkpoint} submitted${coveringFor ? ` for ${coveringFor}` : ""} · ${present}/${
          students.length
        } present${absent > 0 ? `, ${absent} absent` : ""}`
      );
      navigation.goBack();
    } catch (e) {
      // Stay on the screen so the marks aren't lost — a teacher who has just
      // walked a line of forty students must not have to start again.
      const shown = describeError(
        e,
        { title: "Not submitted", message: "Something went wrong saving this. Your marks are still here — try again." },
        "Your marks are still here. Try again when you have signal."
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.offline ? shown.title : "Not submitted",
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmSubmit = () => {
    // Submitting someone else's checkpoint is worth one deliberate stop, even
    // with nobody absent: it is the one case where a teacher could be looking
    // at a class list that is not the one in front of them.
    if (coveringFor && absent === 0) {
      dialog.confirm({
        icon: "people-outline",
        title: `Submit ${duty.checkpoint} for ${coveringFor}?`,
        message: `${students.length} students, all present. This closes the checkpoint and is recorded as submitted by you.`,
        cancelLabel: "Review",
        confirmLabel: "Submit",
        onConfirm: handleSubmit,
      });
      return;
    }
    if (absent > 0) {
      // This dialog exists because someone may be about to submit a mis-tap;
      // a physical interruption reinforces "stop and read".
      haptics.warn();
      dialog.confirm({
        icon: "warning-outline",
        title: `${absent} student${absent === 1 ? "" : "s"} marked absent`,
        message:
          "Absent means the child is unaccounted for, and this will raise a safety alert to the Principal. Submit anyway?",
        cancelLabel: "Review",
        confirmLabel: "Submit",
        destructive: true,
        onConfirm: handleSubmit,
      });
    } else {
      handleSubmit();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      {/* Header, summary and search measured as one block: the fade has to sit
          on the list's top edge, and the block's height varies with whether
          the duty is still editable and whether search is showing. */}
      <View
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setChromeH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
        }}
      >
        <View style={[styles.header, { paddingTop: topInset }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={layout.hitSlop}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to duties"
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {duty.checkpoint}
            </Text>
            <Text style={typography.caption} numberOfLines={1}>
              {duty.group}
            </Text>
          </View>
          {readOnly && <Pill label="Locked" icon="lock-closed" tone="neutral" />}
          {isOverride && <Pill label="Correcting" icon="create" tone="warning" />}
        </View>

        {/* One line that answers "where am I up to?" without doing arithmetic
            against the footer tallies. */}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryStrong}>{students.length}</Text> students
            {marked > 0 ? (
              <Text>
                {" · "}
                <Text style={styles.summaryStrong}>{marked}</Text> marked as an exception
              </Text>
            ) : readOnly ? (
              ""
            ) : (
              " · everyone present unless you say otherwise"
            )}
          </Text>
        </View>

        {isOverride && (
          <View style={styles.overrideBanner}>
            <Ionicons name="create-outline" size={16} color={colors.warning} />
            <Text style={styles.overrideText} numberOfLines={3}>
              This checkpoint has already been submitted{markedBy ? " by " : ""}
              {markedBy ? <Text style={styles.overrideName}>{markedBy}</Text> : null}. Any change
              you make will be recorded in the audit log and attributed to you.
            </Text>
          </View>
        )}

        {!!coveringFor && !readOnly && (
          <View style={styles.coverBanner}>
            <Ionicons name="people-outline" size={16} color={colors.onDark} />
            <Text style={styles.coverText} numberOfLines={2}>
              You are marking this for <Text style={styles.coverName}>{coveringFor}</Text>. It stays
              their duty; the record will show you submitted it.
            </Text>
          </View>
        )}

        {searchable && (
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Find a name or roll number"
            hint={`${visible.length}/${students.length}`}
            accessibilityLabel="Find a student in this group"
            style={styles.search}
          />
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.list, { paddingBottom: footerH + spacing.md }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Mangalarati covers every residential student — 300+ rows. Rows are a
        // fixed height, so the list can skip measuring them entirely and jump
        // straight to any scroll offset.
        getItemLayout={getItemLayout}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={11}
        // Deliberately NOT removeClippedSubviews: on Android it detaches rows
        // that are still on screen during a fast flick, which shows up as rows
        // blanking and popping back.
        removeClippedSubviews={false}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No match"
            body={`Nobody in this group matches “${query}”.`}
            compact
          />
        }
        renderItem={({ item }) => (
          <StudentRow
            student={item}
            code={statuses[item.id]}
            readOnly={readOnly}
            onSet={setStatus}
            onOpenSheet={openSheet}
          />
        )}
      />

      <EdgeFade top={chromeH} visible={scrolled} />

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
        // Only react to a real change. Re-setting the same height on every
        // layout pass re-rendered the whole list mid-scroll.
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setFooterH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
        }}
      >
        <View style={styles.tallies}>
          <Tally value={present} label="Present" tone="success" />
          <Tally value={elsewhere} label="Elsewhere" />
          <Tally value={absent} label="Absent" tone="danger" />
        </View>
        {!readOnly && (
          <PrimaryButton
            // Disabled until something actually differs, so "Save" can never
            // stamp a correction onto a record nobody changed.
            title={
              saving
                ? "Saving…"
                : !isOverride
                  ? "Submit"
                  : changedCount > 0
                    ? `Save ${plural(changedCount, "change")}`
                    : "No changes yet"
            }
            onPress={isOverride ? confirmOverride : confirmSubmit}
            disabled={saving || (isOverride && changedCount === 0)}
            style={styles.submitBtn}
          />
        )}
      </View>

      <BottomSheet
        visible={!!sheetFor}
        onClose={() => setSheetFor(null)}
        title={sheetFor?.name}
        subtitle="Where is this student?"
      >
        <SheetOption
          label="Present"
          hint="At this checkpoint"
          active={sheetFor && !statuses[sheetFor.id]}
          onPress={() => setStatus(sheetFor.id, "P")}
        />
        <SheetOption
          label="Absent"
          hint="Whereabouts unknown — raises a safety alert"
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
              hint={STATUS_HINT[k] || "Accounted for"}
              active={sheetFor && statuses[sheetFor.id] === k}
              onPress={() => setStatus(sheetFor.id, k)}
            />
          ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

/**
 * One student. Memoised on the props that actually change its appearance, so
 * marking one child absent re-renders one row rather than the whole class.
 */
const StudentRow = React.memo(function StudentRow({
  student,
  code,
  readOnly,
  onSet,
  onOpenSheet,
}) {
  const isAbsent = code === "A";
  const isElsewhere = !!code && !isAbsent;
  const meta = code ? STATUS_META[code] : null;
  const label = meta ? meta.label : "Present";

  return (
    <View style={[styles.row, isAbsent && styles.rowAbsent, isElsewhere && styles.rowElsewhere]}>
      {/* Full-height colour edge: the only thing that makes two exceptions
          findable when scrolling back through 300 rows. */}
      <View
        style={[
          styles.stripe,
          isAbsent && styles.stripeAbsent,
          isElsewhere && styles.stripeElsewhere,
        ]}
      />

      <Row
        style={styles.rowMain}
        onPress={() => onOpenSheet(student)}
        disabled={readOnly}
        accessibilityRole="button"
        accessibilityState={{ disabled: readOnly }}
        accessibilityLabel={`${student.name}, roll ${student.roll}, currently ${label}`}
        accessibilityHint={readOnly ? undefined : "Opens the full list of statuses"}
      >
        <Text style={styles.name} numberOfLines={1}>
          {student.name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          Roll {student.roll} · {student.type === "D" ? "Day scholar" : "Residential"}
        </Text>
      </Row>

      {isElsewhere ? (
        // A named status can't be shown on a two-way switch, so it takes the
        // whole control and stays tappable to change.
        <TouchableOpacity
          onPress={() => !readOnly && onOpenSheet(student)}
          disabled={readOnly}
          activeOpacity={0.7}
          style={styles.elsewhereChip}
          accessibilityRole="button"
          accessibilityLabel={`${student.name} is marked ${label}. Change`}
        >
          <Text style={styles.elsewhereText} numberOfLines={1}>
            {label}
          </Text>
          {!readOnly && <Ionicons name="chevron-down" size={12} color={colors.textMuted} />}
        </TouchableOpacity>
      ) : (
        <View style={styles.switch}>
          <MarkButton
            icon="checkmark"
            active={!code}
            tone="success"
            disabled={readOnly}
            onPress={() => onSet(student.id, "P")}
            accessibilityLabel={`Mark ${student.name} present`}
          />
          <MarkButton
            icon="close"
            active={isAbsent}
            tone="danger"
            disabled={readOnly}
            onPress={() => onSet(student.id, "A")}
            accessibilityLabel={`Mark ${student.name} absent`}
          />
        </View>
      )}
    </View>
  );
});

/** Half of the present/absent switch. Filled when it is the current answer. */
function MarkButton({ icon, active, tone, disabled, onPress, accessibilityLabel }) {
  const fill = tone === "danger" ? colors.danger : colors.success;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.markBtn, active && { backgroundColor: fill }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={19} color={active ? colors.white : colors.icon} />
    </TouchableOpacity>
  );
}

function Tally({ value, label, tone }) {
  const lit = value > 0;
  const color =
    tone === "danger" && lit
      ? colors.danger
      : tone === "success" && lit
      ? colors.success
      : colors.text;
  return (
    <View style={styles.tally}>
      <Text style={[styles.tallyValue, { color }]}>{value}</Text>
      <Text style={styles.tallyLabel}>{label}</Text>
    </View>
  );
}

// One switch half; two of them plus the gap is the control's width.
const MARK_BTN = 44;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.sm + 2,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { ...typography.h1, fontSize: 20, lineHeight: 26 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },

  summary: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm + 2 },
  summaryText: { ...typography.caption, fontSize: 13, lineHeight: 18 },
  summaryStrong: { fontFamily: fonts.bold, color: colors.text },

  search: { marginHorizontal: layout.gutter, marginBottom: spacing.sm + 2 },

  // Gold rather than the cover banner's deep teal: this is a caution, not an
  // orientation note, and the two must not be mistaken for each other at a
  // glance when both can appear on the same screen.
  overrideBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    marginHorizontal: layout.gutter,
    marginBottom: spacing.sm + 2,
  },
  overrideText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning,
  },
  overrideName: { fontFamily: fonts.bold },

  coverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryDeep,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    marginHorizontal: layout.gutter,
    marginBottom: spacing.sm + 2,
  },
  coverText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onDarkMuted,
  },
  coverName: { fontFamily: fonts.bold, color: colors.onDark },

  list: { paddingHorizontal: layout.gutter },

  row: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    // Fixed, not minimum: getItemLayout depends on it. Both text lines are
    // single-line, so nothing can grow past this.
    height: ROW_H,
    marginBottom: ROW_GAP,
    paddingRight: spacing.sm,
    overflow: "hidden",
  },
  rowAbsent: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  rowElsewhere: { backgroundColor: colors.cardAlt },

  stripe: { width: 4, height: "100%", backgroundColor: "transparent" },
  stripeAbsent: { backgroundColor: colors.danger },
  stripeElsewhere: { backgroundColor: colors.icon },

  rowMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
    paddingLeft: spacing.md - 4,
    paddingRight: spacing.sm,
    height: "100%",
  },
  name: { ...typography.h3 },

  switch: { flexDirection: "row", gap: spacing.xs + 2, flexShrink: 0 },
  markBtn: {
    width: MARK_BTN,
    height: MARK_BTN,
    borderRadius: MARK_BTN / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },

  elsewhereChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: layout.touch,
    minWidth: 96,
    justifyContent: "center",
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: colors.white,
    flexShrink: 0,
  },
  elsewhereText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.text },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bar,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineTop,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.md - 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    ...shadow.lg,
    shadowOffset: { width: 0, height: -8 },
  },
  tallies: { flexDirection: "row", gap: spacing.lg },
  tally: { alignItems: "flex-start" },
  tallyValue: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 27, ...numeric },
  tallyLabel: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  submitBtn: { paddingHorizontal: spacing.xl },
});
