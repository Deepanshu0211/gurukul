import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
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
import {
  roleLabel,
  canReassign,
  canApproveStaff,
  canManageRoster,
  canManageStaffMember,
  canAddStudent,
} from "../domain/roles";
import AddStudentSheet from "../components/AddStudentSheet";
import { listClasses } from "../domain/classGroups";
import { HOUSE_TONES, NO_HOUSE, houseRank, housesIn } from "../domain/houses";
import {
  addStaffMemberWithLogin,
  setStaffActive,
  fetchInactiveStaff,
  fetchStaffLogins,
  setTemporaryPassword,
} from "../lib/staff";
import LoginDetailsSheet from "../components/LoginDetailsSheet";
import { issueResetCode, formatCode } from "../lib/passwords";
import { dutyStatus, DUTY_STATUS } from "../domain/duties";
import { fmtTime, plural, initial, weekdayName, fmtDay } from "../utils/format";
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

export default function RosterScreen({ navigation, route }) {
  const {
    duties: DUTIES,
    staff: STAFF,
    students: STUDENTS,
    records,
    studentsForDuty,
    reassignDuty,
    refresh,
    staffName: nameOf,
    day,
    isToday,
  } = useSchoolData();
  const { user } = useAuth();
  const dialog = useDialog();
  const toast = useToast();
  const now = useNow();
  const [tab, setTab] = useState(route?.params?.tab || "duties");

  // The Dashboard's "access requests" card sends coordinators straight here.
  useEffect(() => {
    if (route?.params?.tab) {
      setTab(route.params.tab);
      navigation?.setParams?.({ tab: undefined });
    }
  }, [route?.params?.tab, navigation]);
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
        <ScreenHeader title="Roster" subtitle={isToday ? `${weekdayName()}, ${fmtTime(now)}` : fmtDay(day)} />

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
          onManage={
            canManageRoster(user?.role)
              ? () => navigation.navigate("Account", { screen: "Checkpoints", initial: false })
              : null
          }
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
          actorRole={user?.role}
          actorId={user?.id}
          onStaffChanged={refresh}
          bottomInset={tabInset}
          query={query}
          onScroll={onScroll}
        />
      )}
      {tab === "students" && (
        <StudentsTab
          bottomInset={tabInset}
          query={query}
          onScroll={onScroll}
          mayAdd={canAddStudent(user?.role)}
        />
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
  onManage,
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
      ListHeaderComponent={
        onManage ? (
          <Row
            style={styles.manageRow}
            onPress={onManage}
            accessibilityRole="button"
            accessibilityLabel="Manage checkpoints and groups"
          >
            <View style={[styles.personAvatar, styles.requestAvatar]}>
              <Ionicons name="options-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.personMain}>
              <Text style={styles.personName}>Checkpoints & groups</Text>
            </View>
            <Chevron />
          </Row>
        ) : null
      }
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
  actorRole,
  actorId,
  onStaffChanged,
  bottomInset,
  query,
  onScroll,
}) {
  const dialog = useDialog();
  const toast = useToast();
  const dutiesFor = (id) => duties.filter((d) => d.staffId === id).length;

  // ── Add / deactivate / reset (036) ─────────────────────────────────────
  const [selected, setSelected] = useState(null); // staff row whose sheet is open
  const [adding, setAdding] = useState(null); // add-staff draft
  const [handover, setHandover] = useState(null); // staff being deactivated
  const [resetCode, setResetCode] = useState(null); // { name, email, code, expiresAt }
  const [busy, setBusy] = useState(false);
  const [former, setFormer] = useState([]);
  const [showFormer, setShowFormer] = useState(false);
  // Login state per staff member (048): temporary password while it is still
  // the one in use. `loginDetails` is the hand-over sheet when it is open.
  const [logins, setLogins] = useState({});
  const [loginDetails, setLoginDetails] = useState(null);
  const loadLogins = useCallback(async () => {
    if (!mayApprove) return;
    setLogins(await fetchStaffLogins());
  }, [mayApprove]);
  useEffect(() => {
    loadLogins();
  }, [loadLogins]);

  const loadFormer = useCallback(async () => {
    if (!mayApprove) return;
    try {
      setFormer(await fetchInactiveStaff());
    } catch {
      // A database without 036: the section simply does not appear.
      setFormer([]);
    }
  }, [mayApprove]);
  useEffect(() => {
    loadFormer();
  }, [loadFormer]);

  const failed = (e, title) => {
    const shown = describeError(e, { title, message: "Nothing was changed. Try again." });
    dialog.alert({
      icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
      title: shown.title,
      message: shown.message,
      destructive: !shown.offline,
    });
  };

  const addProblem = !adding
    ? null
    : adding.name.trim().length < 2
      ? "Enter their full name"
      : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adding.email.trim())
        ? "Enter a valid email address"
        : STAFF.some((m) => (m.email || "").toLowerCase() === adding.email.trim().toLowerCase())
          ? "Someone on the staff already uses that email"
          : null;

  const submitAdd = async () => {
    if (addProblem || busy) return;
    setBusy(true);
    try {
      const name = adding.name.trim();
      const email = adding.email.trim().toLowerCase();
      const made = await addStaffMemberWithLogin({
        name,
        email,
        phone: adding.phone.trim(),
        classKey: adding.classKey,
        random: adding.random,
      });
      setAdding(null);
      setLoginDetails({ name, email, password: made.password, title: `${name} added` });
      onStaffChanged?.();
      loadLogins();
      reloadRequests();
    } catch (e) {
      failed(e, "Staff member not added");
    } finally {
      setBusy(false);
    }
  };

  /** Create a login, or reset one, with Initial@123 or a random password. */
  const giveTemporaryPassword = (member, random) => {
    const login = logins[member.id];
    setSelected(null);
    const what = random ? "a random password" : "Initial@123";
    dialog.confirm({
      icon: "key-outline",
      title: login?.hasLogin ? `Reset ${member.name}'s password?` : `Create a login for ${member.name}?`,
      message: login?.hasLogin
        ? `Their password becomes ${what} and they are signed out everywhere. ` +
          "They will be asked to choose their own the next time they sign in."
        : `They sign in with ${member.email} and ${what}, and choose their own password the first time.`,
      confirmLabel: login?.hasLogin ? "Reset" : "Create login",
      onConfirm: async () => {
        try {
          const password = await setTemporaryPassword(member.id, random);
          setLoginDetails({ name: member.name, email: member.email, password });
          loadLogins();
        } catch (e) {
          failed(e, "Password not changed");
        }
      },
    });
  };

  const issueReset = (member) => {
    setSelected(null);
    dialog.confirm({
      icon: "key-outline",
      title: `Reset ${member.name}'s password?`,
      message:
        "You get a one-time code to give them in person or by phone. They enter it on the sign-in screen " +
        "under “Forgot password?” and choose a new password themselves — you never see it. " +
        "The code works once and expires in 30 minutes. They are signed out everywhere when it is used.",
      confirmLabel: "Get code",
      onConfirm: async () => {
        try {
          const { code, expiresAt } = await issueResetCode(member.id);
          setResetCode({ name: member.name, email: member.email, code, expiresAt });
        } catch (e) {
          failed(e, "No code issued");
        }
      },
    });
  };

  const deactivate = async (member, replacementId) => {
    setBusy(true);
    try {
      await setStaffActive(member.id, false, replacementId);
      setHandover(null);
      toast.show(
        replacementId
          ? `${member.name} deactivated · duties moved to ${STAFF.find((m) => m.id === replacementId)?.name || "cover"}`
          : `${member.name} deactivated`
      );
      onStaffChanged?.();
      loadFormer();
    } catch (e) {
      failed(e, "Not deactivated");
    } finally {
      setBusy(false);
    }
  };

  const startDeactivate = (member) => {
    setSelected(null);
    if (dutiesFor(member.id) > 0 || member.classKey) {
      setHandover(member);
      return;
    }
    dialog.confirm({
      icon: "person-remove-outline",
      title: `Deactivate ${member.name}?`,
      message:
        "They are signed out and can no longer open the app. Their past registers stay in the record " +
        "under their name. You can reactivate them later from Former staff.",
      confirmLabel: "Deactivate",
      destructive: true,
      onConfirm: () => deactivate(member, null),
    });
  };

  const reactivate = async (member) => {
    try {
      await setStaffActive(member.id, true);
      toast.show(`${member.name} is active again`);
      onStaffChanged?.();
      loadFormer();
    } catch (e) {
      failed(e, "Not reactivated");
    }
  };

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
  const classes = useMemo(
    () =>
      listClasses(students).map((c) => ({
        ...c,
        teacher: (STAFF || []).find((m) => m.classKey === c.key)?.name || null,
      })),
    [students, STAFF]
  );

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
    ...(mayApprove && former.length
      ? [{ key: "former", kind: "former", data: showFormer ? former : [] }]
      : []),
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
        section.kind === "former" ? (
          <SectionLabel
            style={styles.countHead}
            count={former.length}
            action={
              <TextAction
                label={showFormer ? "Hide" : "Show"}
                onPress={() => setShowFormer((v) => !v)}
                accessibilityLabel={showFormer ? "Hide former staff" : "Show former staff"}
              />
            }
          >
            Former staff
          </SectionLabel>
        ) : section.kind === "requests" ? (
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
                mayApprove
                  ? setAdding({ name: "", email: "", phone: "", classKey: null, pickingClass: false, random: false })
                  : dialog.alert({
                      icon: "person-add-outline",
                      title: "Add staff",
                      message: "Adding a staff member is done by a coordinator or the administrator.",
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
        if (section.kind === "former") {
          return (
            <View style={[styles.personRow, styles.formerRow]}>
              <View style={styles.personAvatar}>
                <Text style={styles.personAvatarText}>{initial(item.name)}</Text>
              </View>
              <View style={styles.personMain}>
                <Text style={styles.personName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {roleLabel(item.role)} · {item.email}
                </Text>
              </View>
              {canManageStaffMember(actorRole, item.role) && (
                <TextAction
                  label="Reactivate"
                  onPress={() => reactivate(item)}
                  accessibilityLabel={`Reactivate ${item.name}`}
                />
              )}
            </View>
          );
        }
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
            // A sheet of what can actually be done to this person — and only
            // that. It used to be a dialog saying deactivation was "not
            // available yet"; 036 built it, so the row now does it.
            onPress={() => setSelected(item)}
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
                {logins[item.id] && !logins[item.id].hasLogin
                  ? " · no login yet"
                  : logins[item.id]?.mustChange
                    ? " · temporary password"
                    : ""}
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

    {/* One staff member: details, and what this coordinator may do to them. */}
    <BottomSheet
      visible={!!selected}
      onClose={() => setSelected(null)}
      title={selected?.name}
      subtitle={selected ? `${roleLabel(selected.role)}${selected.classLabel ? ` · ${selected.classLabel}` : ""}` : ""}
      showClose
      scroll
    >
      {!!selected && (
        <>
          <SheetOption icon="mail-outline" label={selected.email || "No email"} hint="Sign-in address" />
          {!!selected.phone && <SheetOption icon="call-outline" label={selected.phone} hint="Phone" />}
          {/* Login (048). The temporary password is shown only until they
              replace it — a password they chose is never readable. */}
          {mayApprove && logins[selected.id] && (() => {
            const login = logins[selected.id];
            if (!login.hasLogin) {
              return <SheetOption icon="lock-open-outline" label="No login yet" hint="Create one below" />;
            }
            if (login.tempPassword) {
              return (
                <SheetOption
                  icon="key-outline"
                  label={`Password: ${login.tempPassword}`}
                  hint="Temporary — they have not changed it yet. Tap to copy login details"
                  onPress={() => {
                    const s = selected;
                    setSelected(null);
                    setLoginDetails({ name: s.name, email: s.email, password: login.tempPassword });
                  }}
                  trailing={<Ionicons name="copy-outline" size={18} color={colors.icon} />}
                />
              );
            }
            return (
              <SheetOption
                icon="shield-checkmark-outline"
                label="Has set their own password"
                hint="Private to them — reset it below if they forget it"
              />
            );
          })()}
          <SheetOption
            icon="calendar-outline"
            label={plural(dutiesFor(selected.id), "duty", "duties")}
            hint="On the roster today"
          />
          {mayApprove && selected.id !== actorId && canManageStaffMember(actorRole, selected.role) ? (
            <>
              <SheetOption
                icon="key-outline"
                label={logins[selected.id] && !logins[selected.id].hasLogin ? "Create login · Initial@123" : "Reset password to Initial@123"}
                hint="The school's default temporary password"
                onPress={() => giveTemporaryPassword(selected, false)}
              />
              <SheetOption
                icon="shuffle-outline"
                label={logins[selected.id] && !logins[selected.id].hasLogin ? "Create login · random password" : "Reset to a random password"}
                hint="A new one-off password, e.g. Kmvqe@428"
                onPress={() => giveTemporaryPassword(selected, true)}
              />
              {logins[selected.id]?.hasLogin !== false && (
                <SheetOption
                  icon="keypad-outline"
                  label="Send a reset code instead"
                  hint="They choose a new password on the sign-in screen; you never see it"
                  onPress={() => issueReset(selected)}
                />
              )}
              <SheetOption
                icon="person-remove-outline"
                label="Deactivate"
                hint="Signs them out; keeps their history"
                danger
                onPress={() => startDeactivate(selected)}
              />
            </>
          ) : (
            <Text style={[typography.caption, styles.approveWarn]}>
              {selected.id === actorId
                ? "This is you. Change your own password from the Account tab."
                : mayApprove
                  ? "Only the administrator can change this account."
                  : "A coordinator manages staff accounts."}
            </Text>
          )}
        </>
      )}
    </BottomSheet>

    {/* Add a staff member directly. */}
    <BottomSheet
      visible={!!adding && !adding.pickingClass}
      onClose={() => !busy && setAdding(null)}
      title="Add staff member"
      subtitle="Added as a teacher with a login ready to use. You get their ID and temporary password to hand over."
      showClose
      scroll
    >
      {!!adding && (
        <>
          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            value={adding.name}
            onChangeText={(name) => setAdding((a) => ({ ...a, name }))}
            placeholder="Radha Priya Mataji"
            placeholderTextColor={colors.icon}
            style={styles.input}
            autoFocus
            maxLength={80}
            accessibilityLabel="Full name"
          />
          <Text style={styles.fieldLabel}>School email</Text>
          <TextInput
            value={adding.email}
            onChangeText={(email) => setAdding((a) => ({ ...a, email }))}
            placeholder="name@gurukula.org"
            placeholderTextColor={colors.icon}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email"
          />
          <Text style={styles.fieldLabel}>Phone (optional)</Text>
          <TextInput
            value={adding.phone}
            onChangeText={(phone) => setAdding((a) => ({ ...a, phone }))}
            placeholder="+91 …"
            placeholderTextColor={colors.icon}
            style={styles.input}
            keyboardType="phone-pad"
            accessibilityLabel="Phone"
          />
          <SheetOption
            icon="school-outline"
            label={adding.classKey ? `Class ${classes.find((c) => c.key === adding.classKey)?.label || ""}` : "No class"}
            hint={adding.classKey ? "Class teacher" : "Duty staff, or choose their class"}
            onPress={() => setAdding((a) => ({ ...a, pickingClass: true }))}
            trailing={<Ionicons name="chevron-forward" size={16} color={colors.icon} />}
          />
          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Temporary password</Text>
          <SheetOption
            icon="key-outline"
            label="Initial@123"
            hint="The school default"
            active={!adding.random}
            onPress={() => setAdding((a) => ({ ...a, random: false }))}
          />
          <SheetOption
            icon="shuffle-outline"
            label="Random password"
            hint="A one-off password made for them"
            active={!!adding.random}
            onPress={() => setAdding((a) => ({ ...a, random: true }))}
          />
          {!!addProblem && (adding.name || adding.email) ? (
            <Text style={styles.fieldProblem}>{addProblem}</Text>
          ) : null}
          <PrimaryButton
            title={busy ? "Adding…" : "Add staff member"}
            icon="person-add-outline"
            onPress={submitAdd}
            disabled={!!addProblem || busy}
            style={{ marginTop: spacing.md }}
          />
        </>
      )}
    </BottomSheet>

    <BottomSheet
      visible={!!adding?.pickingClass}
      onClose={() => setAdding((a) => ({ ...a, pickingClass: false }))}
      title="Class teacher for"
      subtitle="Optional"
      showClose
    >
      <SheetOption
        icon="remove-circle-outline"
        label="No class"
        active={!adding?.classKey}
        onPress={() => setAdding((a) => ({ ...a, classKey: null, pickingClass: false }))}
      />
      {classes.map((c) => (
        <SheetOption
          key={c.key}
          icon="school-outline"
          label={c.label}
          hint={c.teacher ? `Currently ${c.teacher} — they would lose it` : plural(c.students, "student")}
          active={adding?.classKey === c.key}
          onPress={() => setAdding((a) => ({ ...a, classKey: c.key, pickingClass: false }))}
        />
      ))}
    </BottomSheet>

    {/* Deactivating someone who still has duties: who takes them over. */}
    <BottomSheet
      visible={!!handover}
      onClose={() => !busy && setHandover(null)}
      title={`Who covers for ${handover?.name || ""}?`}
      subtitle={
        handover
          ? `${plural(dutiesFor(handover.id), "pending duty", "pending duties")} today` +
            `${handover.classLabel ? ` and ${handover.classLabel}` : ""}` +
            " move to the person you pick. Their past registers stay under their name."
          : ""
      }
      showClose
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        STAFF.filter((m) => m.id !== handover?.id && !["nurse", "reception"].includes(m.role)).map((m) => (
          <SheetOption
            key={m.id}
            label={m.name}
            hint={roleLabel(m.role) + (m.classLabel ? ` · ${m.classLabel}` : "")}
            onPress={() => deactivate(handover, m.id)}
          />
        ))
      )}
    </BottomSheet>

    <LoginDetailsSheet
      details={loginDetails}
      title={loginDetails?.title || "Login details"}
      onClose={() => setLoginDetails(null)}
    />

    {/* The code, shown once. */}
    <BottomSheet
      visible={!!resetCode}
      onClose={() => setResetCode(null)}
      title="One-time reset code"
      subtitle={resetCode ? `For ${resetCode.name}. Give it to them yourself — do not post it in a group.` : ""}
      showClose
    >
      {!!resetCode && (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeText} selectable accessibilityLabel={`Code ${resetCode.code.split("").join(" ")}`}>
              {formatCode(resetCode.code)}
            </Text>
          </View>
          <Text style={[typography.caption, styles.approveWarn]}>
            On the sign-in screen they tap “Forgot password?”, enter {resetCode.email}, this code and a new
            password. It expires at{" "}
            {new Date(resetCode.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} and
            works once. Closing this sheet does not cancel it.
          </Text>
          <PrimaryButton title="Done" onPress={() => setResetCode(null)} style={{ marginTop: spacing.md }} />
        </>
      )}
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

function StudentsTab({ bottomInset, query, onScroll, mayAdd }) {
  const dialog = useDialog();
  const { students, loading, error, reload } = useStudents();
  const [adding, setAdding] = useState(false);

  // Which way the register is cut. Not persisted: it is a way of looking,
  // not a setting, and a list that comes back grouped differently from how
  // you left the screen is more confusing than one that always starts by class.
  const [groupBy, setGroupBy] = useState("class");
  // Which of the four houses is open. Null shows all four, one after another.
  const [house, setHouse] = useState(null);

  // The four houses as their own categories, with what a house master asks
  // first: how many, and how many of them board.
  const houseCards = useMemo(() => {
    const names = housesIn(students);
    const cards = names.map((name) => {
      const inHouse = students.filter((s) => s.house === name);
      return {
        name,
        total: inHouse.length,
        residential: inHouse.filter((s) => s.type !== "D").length,
        classes: new Set(inHouse.map((s) => s.key)).size,
      };
    });
    const none = students.filter((s) => !s.house).length;
    if (none) cards.push({ name: NO_HOUSE, total: none, residential: null, classes: null });
    return cards;
  }, [students]);

  // Stable identity, so the memoised rows below aren't invalidated on every
  // keystroke in the search field.
  const showStudent = useCallback(
    (s) =>
      dialog.alert({
        icon: "school-outline",
        title: s.name,
        // The house is on the printed Saturday assembly sheet, so it has to be
        // checkable from inside the app — an office correcting a house on the
        // signed page needs to see the same value the sheet was built from.
        message: `Admission no. ${s.adm}\nClass ${s.label} · Roll ${s.roll || "—"}\n${
          TYPE_LABEL[s.type]
        }\nHouse: ${s.house || "not assigned"}${s.remedial ? "\nRemedial batch" : ""}`,
      }),
    [dialog]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool =
      groupBy === "house" && house
        ? students.filter((s) => (house === NO_HOUSE ? !s.house : s.house === house))
        : students;
    if (!q) return pool;
    return pool.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.adm.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        (s.house || "").toLowerCase().includes(q)
    );
  }, [students, query, groupBy, house]);

  // Two ways to cut the same register. Class is how the register is kept and
  // how attendance is taken; house is how the Saturday assembly is arranged
  // and how sports and competitions are run, so the school asks both
  // questions and neither is a filter on the other.
  const sections = useMemo(() => {
    const byHouse = groupBy === "house" && !house;
    const key = byHouse
      // Null is a real answer here, not a gap to hide: a child with no
      // house yet has to be findable, or nobody ever assigns them one.
      ? (s) => s.house || NO_HOUSE
      : (s) => s.label;

    const groups = filtered.reduce((acc, s) => {
      const k = key(s);
      (acc[k] = acc[k] || []).push(s);
      return acc;
    }, {});

    return Object.entries(groups)
      .sort((a, b) =>
        byHouse
          // The printed sheet's order; unassigned last.
          ? houseRank(a[0]) - houseRank(b[0]) || a[0].localeCompare(b[0])
          : a[0].localeCompare(b[0], undefined, { numeric: true })
      )
      .map(([label, data]) => ({
        title: label,
        // Within a house the classes are jumbled, so roll number alone is
        // meaningless — order by class first, then roll, as the register does.
        data:
          byHouse
            ? [...data].sort(
                (x, y) =>
                  String(x.label).localeCompare(String(y.label), undefined, { numeric: true }) ||
                  (x.roll || 0) - (y.roll || 0)
              )
            : data,
      }));
  }, [filtered, groupBy, house]);

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
    <>
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
        <>
        <SectionLabel
          style={styles.countHead}
          action={
            <TextAction
              label="+ Add"
              accessibilityLabel="Add student"
              onPress={() =>
                mayAdd
                  ? setAdding(true)
                  : dialog.alert({
                      icon: "person-add-outline",
                      title: "Add student",
                      message: "Students are added by teachers and coordinators.",
                    })
              }
            />
          }
        >
          {query ? `${filtered.length} of ${students.length}` : `${students.length} students`}
        </SectionLabel>

        {/* Two ways to read the same register, not a filter: nothing is
            hidden either way, the children are only gathered differently. */}
        <View style={styles.groupBar}>
          {[["class", "By class"], ["house", "By house"]].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.groupTab, groupBy === key && styles.groupTabOn]}
              onPress={() => {
                setGroupBy(key);
                setHouse(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: groupBy === key }}
              accessibilityLabel={`Group students ${label.toLowerCase()}`}
            >
              <Text style={[styles.groupTabText, groupBy === key && styles.groupTabTextOn]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {groupBy === "house" && (
          <View style={styles.houseGrid}>
            {houseCards.map((h) => {
              const on = house === h.name;
              const tone = HOUSE_TONES[h.name];
              return (
                <TouchableOpacity
                  key={h.name}
                  onPress={() => setHouse(on ? null : h.name)}
                  activeOpacity={0.8}
                  style={[
                    styles.houseCard,
                    tone && { borderLeftColor: colors[tone] },
                    on && styles.houseCardOn,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${h.name}, ${plural(h.total, "student")}${on ? ", showing" : ""}`}
                >
                  <Text style={[styles.houseName, on && { color: colors.onDark }]} numberOfLines={1}>
                    {h.name}
                  </Text>
                  <Text style={[styles.houseCount, on && { color: colors.onDark }]}>{h.total}</Text>
                  <Text style={[typography.caption, on && { color: colors.onDarkMuted }]} numberOfLines={1}>
                    {h.residential == null ? "Needs a house" : `${h.residential} residential`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </>
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
          {groupBy === "house" && !house ? section.title : `Class ${section.title}`} ·{" "}
          {section.data.length}
        </Text>
      )}
      renderItem={({ item }) => <StudentRow student={item} onOpen={showStudent} />}
    />
    <AddStudentSheet visible={adding} onClose={() => setAdding(false)} onAdded={reload} />
    </>
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
  houseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  houseCard: {
    ...surface.card,
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    gap: 1,
  },
  houseCardOn: { backgroundColor: colors.primary },
  houseName: { ...typography.h3 },
  houseCount: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text, ...numeric },
  groupBar: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  groupTab: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  groupTabOn: { backgroundColor: colors.primary },
  groupTabText: { ...typography.caption, color: colors.textMuted },
  groupTabTextOn: { color: colors.white, fontWeight: "600" },
  requestAvatar: { backgroundColor: colors.cardAlt },
  manageRow: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    borderRadius: radius.md,
    minHeight: layout.row - 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  formerRow: { opacity: 0.8 },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs + 2 },
  input: {
    ...surface.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 2,
    minHeight: layout.touch,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  fieldProblem: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  codeBox: {
    ...surface.sunken,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  codeText: {
    fontFamily: fonts.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: 4,
    color: colors.primary,
    ...numeric,
  },
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
