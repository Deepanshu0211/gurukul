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
import { SectionLabel, EmptyState, SecondaryButton, Row, StatusTag } from "../components/ui";
import { NOW } from "../data/mockData";
import { defaultsToOwnDuties } from "../domain/roles";
import { DUTY_STATUS, groupDuties, escalationStage, summarise } from "../domain/duties";
import { plural, fmtTime, fmtDuration } from "../utils/format";
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
  } = useSchoolData();
  const [refreshing, setRefreshing] = useState(false);
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll } = useScrolled();

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

  const { urgent, later, done } = useMemo(
    () => groupDuties(duties, records, NOW),
    [duties, records]
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
        <EmptyState
          icon="cloud-offline-outline"
          title="Can't reach the school server"
          body={error}
          action={<SecondaryButton title="Try again" onPress={refresh} style={styles.retryBtn} />}
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
            scopeNote={showingMine ? "Your duties today" : "All duties today"}
            done={done.length}
            total={duties.length}
            pending={urgent.length}
            showScope={ownFirst}
            coverHint={ownFirst && scope === "all" && allDuties.length <= myDuties.length}
            scope={scope}
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
    </SafeAreaView>
  );
}

function DutiesHeader({
  user,
  scopeNote,
  done,
  total,
  pending,
  showScope,
  coverHint,
  scope,
  onScope,
  mineCount,
  allCount,
  query,
  onQuery,
  searchable,
  resultCount,
}) {
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
        meta={`${scopeNote} · Friday, ${fmtTime(NOW)}`}
        done={done}
        total={total}
        badge={badge}
      />

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
  const overdue = duty.status === DUTY_STATUS.OVERDUE;
  const esc = escalationStage(duty, NOW);
  const countdownText = overdue
    ? `Overdue by ${fmtDuration(NOW - duty.end)}`
    : `Closes in ${fmtDuration(duty.end - NOW)}`;

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
