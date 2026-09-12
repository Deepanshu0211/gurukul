import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
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
import GreetingHeader from "../components/GreetingHeader";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import SearchField from "../components/SearchField";
import Segmented from "../components/Segmented";
import FadeIn from "../components/FadeIn";
import { SectionLabel, EmptyState, Row, StatusTag, ErrorState, IconCircle, Chevron } from "../components/ui";
import StatusBoardSheet from "../components/StatusBoardSheet";
import CalendarSheet from "../components/CalendarSheet";
import { useNow } from "../lib/clock";
import { defaultsToOwnDuties } from "../domain/roles";
import { DUTY_STATUS, groupDuties, escalationStage, summarise } from "../domain/duties";
import { plural, fmtTime, fmtDuration, weekdayName, fmtDay, todayISO } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";

const SECTIONS = {
  URGENT: "urgent",
  LATER: "later",
  DONE: "done",
};

// Every row type reserves the same leading slot, so the checkpoint names in
// "Later today" and "Submitted" start at one shared left edge instead of two.
const LEAD_W = 52;

// Above this many rows the list stops being scannable and the search field
// earns its space. A teacher's own day is 4–8 duties; the whole school's is 30+.
const SEARCH_THRESHOLD = 8;

export default function DutiesScreen({ navigation }) {
  const { user } = useAuth();
  const {
    duties: allDuties,
    records,
    loading,
    error,
    refresh,
    studentsForDuty,
    staffName,
    day,
    setDay,
    isToday,
  } = useSchoolData();
  const [refreshing, setRefreshing] = useState(false);
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll } = useScrolled();
  const now = useNow();

  // Reload on focus so a coordinator's reassignment shows up when a teacher
  // returns to this tab, rather than only after an app restart.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Only a teacher gets the Mine/Everyone switch — a coordinator or MOD has
  // no duties of their own to filter down to, so for them "mine" would be an
  // empty list.
  const ownFirst = defaultsToOwnDuties(user?.role);

  // Teachers land on their own duties, but can switch to the whole day and
  // mark a colleague's checkpoint — a duty teacher is regularly away and the
  // window still has to be met.
  const [scope, setScope] = useState("mine");
  // The morning report's counts. It lives here as well as on the Dashboard
  // because a class teacher has no Dashboard tab — Duties IS their home
  // screen — and they are the people the sheet was built for. Putting it
  // only on the Dashboard made it invisible to every teacher in the school.
  const [statusOpen, setStatusOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const showingMine = ownFirst && scope === "mine";

  const myDuties = useMemo(
    () => allDuties.filter((d) => d.staffId === user?.id),
    [allDuties, user?.id]
  );

  const duties = useMemo(() => {
    const base = showingMine ? myDuties : allDuties;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (d) =>
        d.checkpoint.toLowerCase().includes(q) ||
        d.group.toLowerCase().includes(q) ||
        staffName(d.staffId).toLowerCase().includes(q)
    );
  }, [showingMine, myDuties, allDuties, query, staffName]);

  // `now` in the deps, so the list regroups as a checkpoint's window opens
  // and closes rather than only when the data changes.
  const { urgent, later, done } = useMemo(
    () => groupDuties(duties, records, now),
    [duties, records, now]
  );

  const sections = useMemo(
    () =>
      [
        { key: SECTIONS.URGENT, title: "Needs attention", tone: "due", data: urgent },
        { key: SECTIONS.LATER, title: "Later today", tone: "pending", data: later },
        { key: SECTIONS.DONE, title: "Submitted", tone: "submitted", data: done },
      ].filter((s) => s.data.length > 0),
    [urgent, later, done]
  );

  // Resolved once per duty rather than inside renderItem. Group resolution
  // walks the whole 415-student register, and doing that per row per render
  // was the reason this list stuttered while scrolling.
  const countFor = useMemo(() => {
    const map = {};
    duties.forEach((d) => {
      map[d.id] = studentsForDuty(d).length;
    });
    return map;
  }, [duties, studentsForDuty]);

  const openDuty = (id) => navigation.navigate("DutyMarking", { dutyId: id });

  if (loading && duties.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={["left", "right"]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.centeredText}>Loading today's duties…</Text>
      </SafeAreaView>
    );
  }

  if (error && duties.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={["left", "right"]}>
        {/* `title` is the fallback wording only, for failures describeError
            cannot name. It used to say "Can't reach the school server", which
            named a cause it did not know — a database that was behind sent
            teachers to check the wi-fi for it. */}
        <ErrorState
          error={error}
          title="Can't load today's duties"
          onRetry={refresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabInset }]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <DutiesHeader
            user={user}
            day={day}
            isToday={isToday}
            onPickDay={() => setCalendarOpen(true)}
            onBackToToday={() => setDay(todayISO())}
            scopeNote={
              // 'today' is a lie on any other day, and the header is the one
              // place a reader looks to find out which day they are on.
              isToday
                ? showingMine
                  ? "Your duties today"
                  : "All duties today"
                : showingMine
                  ? `Your duties · ${fmtDay(day)}`
                  : `All duties · ${fmtDay(day)}`
            }
            done={done.length}
            total={duties.length}
            pending={urgent.length}
            showScope={ownFirst}
            coverHint={ownFirst && scope === "all" && allDuties.length <= myDuties.length}
            scope={scope}
            onOpenStatus={() => setStatusOpen(true)}
            onScope={setScope}
            mineCount={myDuties.length}
            allCount={allDuties.length}
            query={query}
            onQuery={setQuery}
            searchable={(showingMine ? myDuties : allDuties).length > SEARCH_THRESHOLD}
            resultCount={duties.length}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing assigned today"
            body="Duties appear here as the coordinator assigns them."
          />
        }
        renderSectionHeader={({ section }) => (
          <SectionLabel count={section.data.length} tone={section.tone}>
            {section.title}
          </SectionLabel>
        )}
        renderItem={({ item, section, index }) => {
          const count = countFor[item.id] ?? 0;
          const onPress = () => openDuty(item.id);
          // Whose duty this is, shown only when it is not the reader's own.
          const owner = item.staffId !== user?.id ? staffName(item.staffId) || null : null;

          if (section.key === SECTIONS.URGENT) {
            return <UrgentCard duty={item} count={count} owner={owner} onPress={onPress} index={index} />;
          }
          if (section.key === SECTIONS.LATER) {
            return <LaterRow duty={item} count={count} owner={owner} onPress={onPress} index={index} />;
          }
          return (
            <DoneRow
              duty={item}
              count={count}
              owner={owner}
              record={records[item.id]}
              onPress={onPress}
              index={index}
            />
          );
        }}
      />

      <EdgeFade top={0} height={topInset} visible={scrolled} />

      <StatusBoardSheet visible={statusOpen} onClose={() => setStatusOpen(false)} day={day} />

      <CalendarSheet
        visible={calendarOpen}
        selected={day}
        onSelect={(d) => {
          setDay(d);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
    </SafeAreaView>
  );
}

function DutiesHeader({
  user,
  // The day the screen is showing, and the two things needed to change it.
  // Props, not context: this component is rendered inside a SectionList
  // header and reads nothing from useSchoolData itself.
  day,
  isToday,
  onPickDay,
  onBackToToday,
  scopeNote,
  done,
  total,
  pending,
  showScope,
  coverHint,
  scope,
  onOpenStatus,
  onScope,
  mineCount,
  allCount,
  query,
  onQuery,
  searchable,
  resultCount,
}) {
  const now = useNow();
  const allDone = total > 0 && done === total;

  const badge =
    pending > 0
      ? { text: `${pending} pending`, tone: "warning" }
      : allDone
      ? { text: "All clear", tone: "success", icon: "checkmark" }
      : null;

  return (
    <>
      <GreetingHeader
        user={user}
        // The clock is only shown on today. On a past day the header read
        // 'Your duties · Thursday, 10 Sep · Saturday, 11:38 PM' — two
        // different days in one line — and the time answers a question
        // ('am I late?') that a finished day cannot be asked.
        meta={isToday ? `${scopeNote} · ${weekdayName()}, ${fmtTime(now)}` : scopeNote}
        done={done}
        total={total}
        badge={badge}
      />

      {/* The only route in the app to a PAST day's checkpoint.

          A coordinator, the MOD and the Principal's office may all correct a
          submitted register — 006 grants it and the database enforces it —
          but there was nowhere to do it from. Records reads a past day back
          and offers no way to change it, and Records is on the teacher's tab
          bar only, so those three roles could not even see one. A permission
          with no button attached to it.

          Pick a day here and the existing correction flow does the rest,
          unchanged: tap a submitted checkpoint and it opens in Correcting
          mode. It also lets a teacher fill in a register they missed, which
          the database already allowed while it was still pending. */}
      <TouchableOpacity
        style={[styles.dayPill, !isToday && styles.dayPillPast]}
        onPress={onPickDay}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${fmtDay(day)}. Change day`}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={isToday ? colors.primary : colors.warning}
        />
        <Text style={[styles.dayPillText, !isToday && styles.dayPillTextPast]}>
          {fmtDay(day)}
        </Text>
        {!isToday && (
          <Text style={styles.dayPillBack} onPress={onBackToToday}>
            Back to today
          </Text>
        )}
      </TouchableOpacity>

      {showScope && (
        <Segmented
          style={styles.scope}
          value={scope}
          onChange={onScope}
          items={[
            { key: "mine", label: "My duties", count: mineCount },
            { key: "all", label: "Whole school", count: allCount },
          ]}
        />
      )}

      {/* The school's own morning-report columns for this person's class:
          residential and day scholars, present, absent, sick, not reported. */}
      <TouchableOpacity
        style={styles.statusRow}
        onPress={onOpenStatus}
        accessibilityRole="button"
        accessibilityLabel="Show today's status"
      >
        <IconCircle bg={colors.primarySoft} size={36}>
          <Ionicons name="stats-chart-outline" size={16} color={colors.primary} />
        </IconCircle>
        <View style={styles.statusText}>
          <Text style={styles.statusTitle}>{isToday ? "Today's status" : `Status · ${fmtDay(day)}`}</Text>
          <Text style={styles.statusSub} numberOfLines={1}>
            {user?.classLabel
              ? `Counts for ${user.classLabel}`
              : "Residential and day counts, class by class"}
          </Text>
        </View>
        <Chevron />
      </TouchableOpacity>

      {/* "Whole school" returned nothing beyond this teacher's own duties. The
          filtering happens in the database, so no amount of app code can widen
          it — the cover-marking policy has not been applied to this project's
          Supabase yet. Said plainly rather than showing a list that silently
          looks identical to the one next to it. */}
      {coverHint && (
        <View style={styles.notice}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.warning} />
          <Text style={styles.noticeText}>
            Only your own duties are visible. Cover marking needs migration{" "}
            <Text style={styles.noticeStrong}>005_cover_marking.sql</Text> to be run on the school
            database.
          </Text>
        </View>
      )}

      {searchable && (
        <SearchField
          value={query}
          onChangeText={onQuery}
          placeholder="Search checkpoint, class or teacher"
          hint={`${resultCount}`}
          style={styles.search}
        />
      )}
    </>
  );
}

/** Actionable duties carry the most visual weight: countdown, escalation
 *  state, and a real button. Everything else on the screen is quieter. */
function UrgentCard({ duty, count, owner, onPress, index }) {
  // Subscribes to the same shared ticker as every other caller, so the
  // countdown on each card counts down rather than freezing at mount.
  const now = useNow();
  const overdue = duty.status === DUTY_STATUS.OVERDUE;
  const esc = escalationStage(duty, now);
  const countdownText = overdue
    ? `Overdue by ${fmtDuration(now - duty.end)}`
    : `Closes in ${fmtDuration(duty.end - now)}`;

  return (
    <FadeIn index={index}>
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleCol}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {duty.checkpoint}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {duty.group} · {plural(count, "student")}
            {owner ? ` · ${owner}` : ""}
          </Text>
        </View>
        {/* Same tag vocabulary as every other row on the screen, carrying the
            countdown as its label — one element instead of a state pill and a
            timer sitting next to each other saying related things. */}
        <StatusTag
          tone={overdue ? "overdue" : "due"}
          label={countdownText}
          style={[styles.cardTag, overdue && styles.cardTagOnDanger]}
        />
      </View>

      {esc && (
        <View style={styles.escRow}>
          <Ionicons name="megaphone-outline" size={14} color={colors.textMuted} />
          <Text style={styles.escText} numberOfLines={1}>
            {esc.text}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.markBtn}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          owner
            ? `Mark attendance for ${duty.checkpoint}, ${duty.group}, on behalf of ${owner}`
            : `Mark attendance for ${duty.checkpoint}, ${duty.group}`
        }
      >
        <Text style={styles.markBtnText}>
          {owner ? "Mark for them" : "Mark attendance"}
        </Text>
        <Ionicons name="arrow-forward" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
    </FadeIn>
  );
}

/** Nothing to do yet — a quiet row, led by its time. */
function LaterRow({ duty, count, owner, onPress, index }) {
  return (
    <FadeIn index={index}>
    <Row
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${duty.checkpoint}, ${duty.group}, opens at ${fmtTime(duty.start)}${
        owner ? `, assigned to ${owner}` : ""
      }`}
    >
      <View style={styles.lead}>
        <Text style={styles.rowTime}>{fmtTime(duty.start)}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {duty.checkpoint}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {duty.group} · {plural(count, "student")}
          {owner ? ` · ${owner}` : ""}
        </Text>
      </View>
      {/* The tag replaces the chevron rather than joining it: a row can afford
          one trailing element, and the state is worth more than an arrow that
          only repeats "this is tappable". */}
      <StatusTag tone="pending" />
    </Row>
    </FadeIn>
  );
}

/** Done — collapses to one line but keeps the counts the spec asks for (A2),
 *  and stays tappable for the read-only cross-check (A7). */
function DoneRow({ duty, count, owner, record, onPress, index }) {
  const { present, absent } = summarise(count, record?.statuses);

  return (
    <FadeIn index={index}>
    <Row
      style={[styles.row, styles.rowDone]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${duty.checkpoint}, submitted, ${present} of ${count} present${
        absent > 0 ? `, ${absent} absent` : ""
      }`}
    >
      <View style={styles.lead}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={15} color={colors.success} />
        </View>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitleDone} numberOfLines={1}>
          {duty.checkpoint}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          <Text style={styles.doneCount}>
            {present}/{count}
          </Text>{" "}
          present
          {absent > 0 && (
            <Text style={styles.doneAbsent}> · {absent} absent</Text>
          )}
          {record?.at != null ? ` · ${fmtTime(record.at)}` : ""}
          {owner ? ` · ${owner}` : ""}
        </Text>
      </View>
      <StatusTag tone="submitted" />
    </Row>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter },

  scope: { marginTop: spacing.sm },
  dayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  // A past day is tinted, because marking one is a different act from
  // marking today and the screen should not look identical.
  dayPillPast: { backgroundColor: colors.warningBg },
  dayPillText: { ...typography.caption, color: colors.primaryDark, fontWeight: "600" },
  dayPillTextPast: { color: colors.warning },
  dayPillBack: { ...typography.caption, color: colors.primary, marginLeft: spacing.xs },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
  },
  statusText: { flex: 1 },
  statusTitle: { ...typography.bodyStrong, color: colors.text },
  statusSub: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  search: { marginTop: spacing.sm },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning,
  },
  noticeStrong: { fontFamily: fonts.bold },

  card: {
    ...surface.raised,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  cardOverdue: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitleCol: { flex: 1, minWidth: 0 },
  cardTitle: { ...typography.h1, fontSize: 18, lineHeight: 24, marginBottom: 2 },

  cardTag: { marginTop: 1, maxWidth: "56%" },
  // On an overdue card the ground is already dangerBg, so the tag's own tint
  // would disappear into it — white lifts it back off the card.
  cardTagOnDanger: { backgroundColor: colors.white },

  escRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm + 2 },
  escText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textMuted },

  markBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: layout.touch,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  markBtnText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.white },

  row: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    minHeight: layout.row,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  rowDone: { backgroundColor: colors.cardAlt },
  lead: { width: LEAD_W, justifyContent: "center" },
  rowMain: { flex: 1, minWidth: 0, gap: 1 },
  rowTime: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.textMuted, ...numeric },
  rowTitle: { ...typography.bodyStrong },
  // Submitted is a finished, verifiable record — it recedes by sitting on a
  // tinted ground, not by having its own name greyed out. A checkpoint a
  // teacher may need to re-read at 9pm has to stay readable.
  rowTitleDone: { ...typography.bodyStrong },
  doneCount: { fontFamily: fonts.bold, color: colors.text, ...numeric },
  doneAbsent: { fontFamily: fonts.bold, color: colors.danger },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },

  centered: { alignItems: "center", justifyContent: "center", gap: spacing.sm },
  centeredText: { ...typography.caption, fontSize: 13, lineHeight: 18, textAlign: "center" },
  retryBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.lg },
});
