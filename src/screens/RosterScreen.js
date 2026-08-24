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
  PrimaryButton,
} from "../components/ui";
import { useNow } from "../lib/clock";
import { usePendingRequests, approveRequest, rejectRequest } from "../lib/access";
import { describeError } from "../lib/errors";
import { roleLabel, canReassign, canApproveStaff } from "../domain/roles";
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
    students: STUDENTS,
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
          students={STUDENTS}
          mayApprove={canApproveStaff(user?.role)}
          onStaffChanged={refresh}
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

function StaffTab({
  staff: STAFF,
  duties,
  students,
  mayApprove,
  onStaffChanged,
  bottomInset,
  query,
  onScroll,
}) {
  const dialog = useDialog();
  const toast = useToast();
  const dutiesFor = (id) => duties.filter((d) => d.staffId === id).length;

  // Only fetched for the roles that can act on it: to everyone else the queue
  // is not "empty", it does not exist, and 013's read policy agrees.
  const { requests, error: requestError, reload: reloadRequests } = usePendingRequests(mayApprove);
  // Guards a double tap on a slow connection, which would otherwise send two
  // approvals and surface the second as "already decided".
  const [deciding, setDeciding] = useState(null);
  // The request whose approval sheet is open, the class picked in it, and
  // whether the class list is showing on top.
  const [approving, setApproving] = useState(null);
  const [classKey, setClassKey] = useState(null);
  const [pickingClass, setPickingClass] = useState(false);

  const decide = async (req, action) => {
    if (deciding) return;
    setDeciding(req.id);
    try {
      if (action === "approve") {
        const staff = await approveRequest(req.id, classKey);
        toast.show(`${staff?.name || req.name} can now sign in as a teacher`);
        // The new row has to reach the directory, or the person a coordinator
        // just approved is invisible on the screen that approved them.
        onStaffChanged?.();
      } else {
        await rejectRequest(req.id, null);
        toast.show(`Request from ${req.name} declined`);
      }
      await reloadRequests();
    } catch (e) {
      const shown = describeError(e, {
        title: "Could not update the request",
        message: "Something went wrong. Try again in a moment.",
      });
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.title,
        message: shown.message,
        destructive: !shown.offline,
      });
      await reloadRequests();
    } finally {
      setDeciding(null);
      setApproving(null);
    }
  };

  const detail = (req) =>
    `${req.email}` +
    (req.phone ? `
${req.phone}` : "") +
    (req.note ? `

“${req.note}”` : "");

  /**
   * Every class that has students in it, with whoever already teaches it.
   *
   * Built from the register rather than a fixed list, so a class the school
   * adds appears here without a code change. Showing the current teacher is
   * why this is not just a list of keys: two staff sharing a class is allowed
   * (a class teacher and an assistant), so the coordinator needs to see it
   * rather than be stopped by it.
   */
  const classes = useMemo(() => {
    const byKey = new Map();
    for (const st of students || []) {
      if (!byKey.has(st.key)) byKey.set(st.key, { key: st.key, label: st.label, students: 0 });
      byKey.get(st.key).students += 1;
    }
    for (const c of byKey.values()) {
      c.teacher = (STAFF || []).find((m) => m.classKey === c.key)?.name || null;
    }
    return [...byKey.values()].sort((a, b) => {
      const [ga, sa] = a.key.split("|");
      const [gb, sb] = b.key.split("|");
      return Number(ga) - Number(gb) || sa.localeCompare(sb);
    });
  }, [students, STAFF]);

  /**
   * Approving is a sheet, not a dialog, because a class has to be chosen and
   * `Dialog` has room for a message and two buttons. Declining stays its own
   * confirm: `Dialog`'s cancel is a dismissal that the backdrop also fires, so
   * "Decline" in that slot would turn a stray tap into a decision about
   * somebody's job.
   */
  const openRequest = (req) => {
    setApproving(req);
    setClassKey(null);
    setPickingClass(false);
  };

  const declineRequest = (req) =>
    dialog.confirm({
      icon: "close-circle-outline",
      title: `Decline ${req.name}?`,
      message: `${detail(req)}

They keep their sign-in but see nothing, and can ask again.`,
      confirmLabel: "Decline",
      destructive: true,
      onConfirm: () => decide(req, "reject"),
    });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? STAFF.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          roleLabel(s.role).toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q)
      )
    : STAFF;

  // The queue leads. It is the only thing on this screen that is WAITING on
  // the person reading it — a new teacher cannot mark a checkpoint until one
  // of these is tapped — so it sits above a directory that is merely true.
  const sections = [
    ...(mayApprove && requests.length
      ? [{ key: "requests", kind: "requests", data: requests }]
      : []),
    { key: "staff", kind: "staff", data: filtered },
  ];

  const chosen = classes.find((c) => c.key === classKey) || null;

  return (
    <>
    <SectionList
      sections={sections}
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
      ListHeaderComponent={
        requestError ? (
          <Text style={[typography.caption, styles.requestError]}>{requestError}</Text>
        ) : null
      }
      renderSectionHeader={({ section }) =>
        section.kind === "requests" ? (
          <SectionLabel style={styles.countHead} count={requests.length} tone="due">
            Access requests
          </SectionLabel>
        ) : (
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
        )
      }
      renderItem={({ item, section }) => {
        if (section.kind === "requests") {
          return (
            <RequestRow
              request={item}
              busy={deciding === item.id}
              onOpen={() => openRequest(item)}
              onDecline={() => declineRequest(item)}
            />
          );
        }
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

    {/* Approving, with the one decision that has to be made at the same time. */}
    <BottomSheet
      visible={!!approving && !pickingClass}
      onClose={() => !deciding && setApproving(null)}
      title={approving?.name}
      subtitle={approving?.email}
      showClose
      scroll
    >
      {!!approving?.phone && (
        <Text style={[typography.caption, styles.approveLine]}>{approving.phone}</Text>
      )}
      {!!approving?.note && (
        <Text style={[typography.caption, styles.approveLine]}>“{approving.note}”</Text>
      )}

      <SectionLabel style={styles.countHead}>Class teacher for</SectionLabel>
      <SheetOption
        icon="school-outline"
        label={chosen ? chosen.label : "No class"}
        hint={
          chosen
            ? chosen.teacher
              ? `Currently ${chosen.teacher} · ${plural(chosen.students, "student")}`
              : plural(chosen.students, "student")
            : "Duty staff with no class of their own"
        }
        onPress={() => setPickingClass(true)}
        trailing={<Ionicons name="chevron-forward" size={16} color={colors.icon} />}
      />

      {/* Said before the tap, not after. A class is a second grant: 004 opens
          that class's attendance across every checkpoint, whoever marked it. */}
      <Text style={[typography.caption, styles.approveWarn]}>
        Approving creates a teacher login. They will be able to see every student&apos;s
        attendance
        {chosen ? `, and read ${chosen.label} across every checkpoint` : ""}.
      </Text>

      <PrimaryButton
        title={deciding ? "Approving…" : "Approve"}
        icon="checkmark"
        onPress={() => decide(approving, "approve")}
        disabled={!!deciding}
        style={{ marginTop: spacing.md }}
      />
    </BottomSheet>

    {/* Built from the register, so a class the school adds shows up here on
        its own rather than needing a code change. */}
    <BottomSheet
      visible={!!approving && pickingClass}
      onClose={() => setPickingClass(false)}
      title="Class teacher for"
      subtitle={`${approving?.name} · optional`}
      showClose
      scroll
    >
      <SheetOption
        icon="remove-circle-outline"
        label="No class"
        hint="Duty staff with no class of their own"
        active={!classKey}
        onPress={() => {
          setClassKey(null);
          setPickingClass(false);
        }}
      />
      {classes.map((c) => (
        <SheetOption
          key={c.key}
          icon="school-outline"
          label={c.label}
          hint={
            c.teacher
              ? `Currently ${c.teacher} · ${plural(c.students, "student")}`
              : plural(c.students, "student")
          }
          active={classKey === c.key}
          onPress={() => {
            setClassKey(c.key);
            setPickingClass(false);
          }}
        />
      ))}
    </BottomSheet>
    </>
  );
}

/**
 * One person asking to be let in.
 *
 * Both decisions are on the row, because a queue of one or two is read and
 * cleared in the same glance — burying "decline" inside the detail dialog
 * would mean opening a card to say no to somebody you already know you do not
 * recognise. Tapping the row itself opens the detail, which is where the
 * approval actually happens.
 */
function RequestRow({ request, busy, onOpen, onDecline }) {
  return (
    <Row
      style={styles.personRow}
      accessibilityRole="button"
      accessibilityLabel={`Access request from ${request.name}`}
      onPress={busy ? undefined : onOpen}
    >
      <View style={[styles.personAvatar, styles.requestAvatar]}>
        <Ionicons name="person-add-outline" size={16} color={colors.primary} />
      </View>
      <View style={styles.personMain}>
        <Text style={styles.personName} numberOfLines={1}>
          {request.name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {request.email}
        </Text>
      </View>

      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.requestActions}>
          <TouchableOpacity
            onPress={onDecline}
            style={[styles.requestBtn, styles.requestDecline]}
            accessibilityRole="button"
            accessibilityLabel={`Decline ${request.name}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="close" size={16} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpen}
            style={[styles.requestBtn, styles.requestApprove]}
            accessibilityRole="button"
            accessibilityLabel={`Approve ${request.name}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="checkmark" size={16} color={colors.onDark} />
          </TouchableOpacity>
        </View>
      )}
    </Row>
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
  requestAvatar: { backgroundColor: colors.cardAlt },
  requestActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  requestBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  // Approve is the filled one. Declining is reversible — they can ask again —
  // so it does not need to shout back.
  requestApprove: { backgroundColor: colors.primary },
  requestDecline: { backgroundColor: colors.dangerBg },
  requestError: { color: colors.danger, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  approveLine: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  approveWarn: { paddingHorizontal: spacing.md, paddingTop: spacing.md, color: colors.textMuted },

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
