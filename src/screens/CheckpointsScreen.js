import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout, surface, numeric } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import Segmented from "../components/Segmented";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import {
  EmptyState,
  ErrorState,
  Pill,
  PrimaryButton,
  Row,
  SectionLabel,
  TextAction,
  Chevron,
} from "../components/ui";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { useScreenTopInset, useTabContentInset } from "../navigation/tabBarInset";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { canManageRoster } from "../domain/roles";
import { listClasses } from "../domain/classGroups";
import { resolveGroup } from "../lib/duties";
import {
  useRoster,
  saveCheckpoint,
  setCheckpointActive,
  removeCheckpoint,
  daysLabel,
  toHHMM,
  parseHHMM,
} from "../lib/roster";
import { describeError } from "../lib/errors";
import { haptics } from "../lib/haptics";
import { fmtTime, plural } from "../utils/format";

/**
 * The coordinator's roster desk: which checkpoints the school takes, which
 * groups each one is split into, who marks each group, and on which days.
 *
 * Two ways to read the same roster, because the school asks both questions:
 *  - By checkpoint — "who is covering Dinner?" — the timetable, top to bottom.
 *  - By class — "is 6 Krishna counted at every checkpoint today?" — the
 *    question a gap in the safety net actually shows up as. A class that no
 *    group covers at a checkpoint is a class nobody is accounting for.
 *
 * The built-in registers (one Morning attendance per class, Mangalarati,
 * breakfast bands, lunch, night) are made by the nightly generator from the
 * register itself, not from a group here. They are shown as a count so the
 * card does not look empty, and they follow a checkpoint switched off here.
 */

const VIEWS = [
  { key: "checkpoint", label: "By checkpoint" },
  { key: "class", label: "By class" },
];

const blankDraft = { id: null, name: "", start: "", end: "", mandatoryEscalation: false };

export default function CheckpointsScreen({ navigation }) {
  const { user } = useAuth();
  const { duties, students, staffName, refresh } = useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const topInset = useScreenTopInset();
  // The tab bar floats over this screen; without this the last card ended
  // underneath it, cut off mid-row.
  const bottomInset = useTabContentInset();
  const { scrolled, onScroll } = useScrolled();
  const { checkpoints, groups, loading, error, reload } = useRoster();

  const allowed = canManageRoster(user?.role);
  const [view, setView] = useState("checkpoint");
  const [draft, setDraft] = useState(null); // checkpoint being added/edited
  const [saving, setSaving] = useState(false);
  const [menuFor, setMenuFor] = useState(null); // checkpoint whose ⋯ sheet is open
  const [classOpen, setClassOpen] = useState(null);

  // Back from the group editor → the list shows what was just saved.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const groupsBy = useMemo(() => {
    const m = {};
    groups.forEach((g) => (m[g.checkpointId] = m[g.checkpointId] || []).push(g));
    return m;
  }, [groups]);

  // Today's registers the generator made without a group behind them.
  const builtinBy = useMemo(() => {
    const m = {};
    duties.forEach((d) => {
      if (d.defaultId) return;
      const e = (m[d.checkpointId] = m[d.checkpointId] || { classes: 0, vedic: false });
      // The Vedic register is generated alongside whatever leaves Vedic
      // students out; counting it as "built in" made a hand-picked list look
      // as if it had a second, mystery register.
      if (d.classKey === "*|VEDIC") e.vedic = true;
      else e.classes += 1;
    });
    return m;
  }, [duties]);

  const classes = useMemo(() => listClasses(students), [students]);

  /**
   * For each class, today's checkpoints that cover at least one of its
   * students — from the real duties, resolved the same way the marking screen
   * resolves them, so "covered" here means "on somebody's list".
   */
  const coverage = useMemo(() => {
    const byClass = {};
    classes.forEach((c) => (byClass[c.key] = []));
    duties.forEach((d) => {
      const seen = new Set();
      resolveGroup(d, students).forEach((s) => {
        if (seen.has(s.key)) return;
        seen.add(s.key);
        byClass[s.key]?.push(d);
      });
    });
    Object.values(byClass).forEach((list) => list.sort((a, b) => a.start - b.start));
    return byClass;
  }, [classes, duties, students]);

  // A gap is a checkpoint MOST classes are on and this one is not. "Fewer
  // than the busiest class" flagged every class the moment one got an extra
  // class-wise group, which taught the eye to ignore the colour.
  const usual = useMemo(() => {
    const counts = {};
    Object.values(coverage).forEach((list) =>
      new Set(list.map((d) => d.checkpointId)).forEach((id) => (counts[id] = (counts[id] || 0) + 1))
    );
    const half = classes.length / 2;
    return Object.keys(counts).filter((id) => counts[id] > half);
  }, [coverage, classes.length]);
  const missingFor = (key) => {
    const have = new Set((coverage[key] || []).map((d) => d.checkpointId));
    return usual.filter((id) => !have.has(id));
  };

  const fail = (e, title) => {
    const shown = describeError(e, { title, message: "Nothing was changed. Try again." });
    dialog.alert({
      icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
      title: shown.title,
      message: shown.message,
      destructive: !shown.offline,
    });
  };

  const afterChange = async (message) => {
    haptics.success();
    toast.show(message);
    await Promise.all([reload(), refresh()]);
  };

  // ── Checkpoint add / edit ────────────────────────────────────────────────
  const draftStart = draft ? parseHHMM(draft.start) : null;
  const draftEnd = draft ? parseHHMM(draft.end) : null;
  const draftProblem = !draft
    ? null
    : draft.name.trim().length < 2
      ? "Give it a name"
      : draftStart == null || draftEnd == null
        ? "Times are 24-hour, like 16:30"
        : draftEnd <= draftStart
          ? "The window has to end after it starts"
          : null;

  const openNew = () => setDraft({ ...blankDraft });
  const openEdit = (cp) => {
    setMenuFor(null);
    setDraft({
      id: cp.id,
      name: cp.name,
      start: toHHMM(cp.start),
      end: toHHMM(cp.end),
      mandatoryEscalation: cp.mandatoryEscalation,
    });
  };

  const submitDraft = async () => {
    if (draftProblem || saving) return;
    setSaving(true);
    try {
      const saved = await saveCheckpoint({
        id: draft.id,
        name: draft.name.trim(),
        start: draftStart,
        end: draftEnd,
        mandatoryEscalation: draft.mandatoryEscalation,
      });
      setDraft(null);
      await afterChange(
        draft.id ? `${saved.name} updated` : `${saved.name} added · now add the groups it covers`
      );
    } catch (e) {
      fail(e, draft.id ? "Checkpoint not updated" : "Checkpoint not added");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (cp) => {
    setMenuFor(null);
    const turningOff = cp.active;
    const run = async () => {
      try {
        await setCheckpointActive(cp.id, !turningOff);
        await afterChange(turningOff ? `${cp.name} switched off` : `${cp.name} is back on the roster`);
      } catch (e) {
        fail(e, "Not changed");
      }
    };
    if (!turningOff) return run();
    dialog.confirm({
      icon: "pause-circle-outline",
      title: `Switch off ${cp.name}?`,
      message:
        "Today's and tomorrow's registers that nobody has started are withdrawn, and no new ones are made " +
        "until you switch it back on. Registers already filled in are kept.",
      confirmLabel: "Switch off",
      destructive: true,
      onConfirm: run,
    });
  };

  const confirmRemove = (cp) => {
    setMenuFor(null);
    dialog.confirm({
      icon: "trash-outline",
      title: `Remove ${cp.name}?`,
      message:
        "If it has never been marked it is deleted with its groups. If any register was ever filled in " +
        "against it, it is switched off instead so that history stays readable.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        try {
          const outcome = await removeCheckpoint(cp.id);
          await afterChange(
            outcome === "deleted" ? `${cp.name} removed` : `${cp.name} has history — switched off instead`
          );
        } catch (e) {
          fail(e, "Not removed");
        }
      },
    });
  };

  const openGroup = (params) => navigation.navigate("GroupEditor", params);

  if (!allowed) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={{ paddingTop: topInset, paddingHorizontal: layout.gutter }}>
          <BackButton onPress={() => navigation.goBack()} />
          <EmptyState
            icon="lock-closed-outline"
            title="Coordinators only"
            body="Checkpoints and their groups decide every teacher's day, so they are set by a coordinator or the administrator."
          />
        </View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={{ paddingTop: topInset }}>
      <BackButton onPress={() => navigation.goBack()} />
      <ScreenHeader
        title="Checkpoints"
        right={
          <TouchableOpacity
            onPress={openNew}
            style={styles.addBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add a checkpoint"
          >
            <Ionicons name="add" size={18} color={colors.onDark} />
            <Text style={styles.addBtnText}>New</Text>
          </TouchableOpacity>
        }
      />
      <Segmented items={VIEWS} value={view} onChange={setView} style={styles.views} />
    </View>
  );

  const body =
    loading && !checkpoints.length ? (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={typography.caption}>Loading the roster…</Text>
      </View>
    ) : error ? (
      <ErrorState error={error} title="Can't load checkpoints" onRetry={reload} />
    ) : null;


  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      {view === "checkpoint" ? (
        <FlatList
          data={body ? [] : checkpoints}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            body || (
              <EmptyState
                icon="time-outline"
                title="No checkpoints yet"
                body="Add the first one — a name and a time window."
                compact
              />
            )
          }
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <CheckpointCard
              cp={item}
              groups={groupsBy[item.id] || []}
              builtin={builtinBy[item.id] || { classes: 0, vedic: false }}
              staffName={staffName}
              onMenu={() => setMenuFor(item)}
              onOpenGroup={(g) => openGroup({ groupId: g.id, checkpointId: item.id })}
              onAddGroup={() => openGroup({ checkpointId: item.id })}
            />
          )}
        />
      ) : (
        <FlatList
          data={body ? [] : classes}
          keyExtractor={(c) => c.key}
          ListHeaderComponent={header}
          ListEmptyComponent={body}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            const list = coverage[item.key] || [];
            const missing = missingFor(item.key);
            const short = missing.length > 0;
            return (
              <Row
                style={styles.classRow}
                onPress={() => setClassOpen(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}, ${plural(list.length, "checkpoint")} today`}
              >
                <View style={styles.classMain}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    Class {item.label}
                  </Text>
                  {short && (
                    <Text style={[styles.cardMeta, { color: colors.warning }]} numberOfLines={1}>
                      Missing{" "}
                      {missing
                        .map((id) => duties.find((d) => d.checkpointId === id)?.checkpoint || id)
                        .join(", ")}
                    </Text>
                  )}
                </View>
                <Text style={[styles.classCount, short && { color: colors.warning }]}>{list.length}</Text>
                <Chevron />
              </Row>
            );
          }}
        />
      )}

      <EdgeFade top={0} height={topInset} visible={scrolled} />

      {/* Add / edit a checkpoint */}
      <BottomSheet
        visible={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "Edit checkpoint" : "New checkpoint"}
        subtitle={
          draft?.id
            ? "Changing the window moves reminders and escalation with it."
            : "Then add the groups it covers — a class, a band, a house or a hand-picked list."
        }
        showClose
      >
        {!!draft && (
          <>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
              placeholder="Evening sports, Choir practice…"
              placeholderTextColor={colors.icon}
              style={styles.input}
              maxLength={40}
              autoFocus={!draft.id}
              accessibilityLabel="Checkpoint name"
            />
            <Text style={styles.fieldLabel}>Window (24-hour)</Text>
            <View style={styles.timeRow}>
              <TextInput
                value={draft.start}
                onChangeText={(start) => setDraft((d) => ({ ...d, start }))}
                placeholder="16:30"
                placeholderTextColor={colors.icon}
                style={[styles.input, styles.timeInput]}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Opens at"
              />
              <Ionicons name="arrow-forward" size={16} color={colors.icon} />
              <TextInput
                value={draft.end}
                onChangeText={(end) => setDraft((d) => ({ ...d, end }))}
                placeholder="17:10"
                placeholderTextColor={colors.icon}
                style={[styles.input, styles.timeInput]}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Closes at"
              />
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.h3}>Mandatory escalation</Text>
                <Text style={typography.caption}>
                  A missed register goes straight to the Principal (meals and night).
                </Text>
              </View>
              <Switch
                value={draft.mandatoryEscalation}
                onValueChange={(v) => setDraft((d) => ({ ...d, mandatoryEscalation: v }))}
                trackColor={{ true: colors.primary, false: colors.track }}
                thumbColor={colors.white}
                accessibilityLabel="Mandatory escalation"
              />
            </View>
            {!!draftProblem && (draft.name || draft.start || draft.end) ? (
              <Text style={styles.problem}>{draftProblem}</Text>
            ) : null}
            <PrimaryButton
              title={saving ? "Saving…" : draft.id ? "Save changes" : "Add checkpoint"}
              icon="checkmark"
              onPress={submitDraft}
              disabled={!!draftProblem || saving}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </BottomSheet>

      {/* ⋯ on a checkpoint */}
      <BottomSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        subtitle={menuFor ? `${fmtTime(menuFor.start)}–${fmtTime(menuFor.end)}` : ""}
      >
        {!!menuFor && (
          <>
            <SheetOption icon="create-outline" label="Edit name and time" onPress={() => openEdit(menuFor)} />
            <SheetOption
              icon="people-outline"
              label="Add a group"
              hint="A class, band, house or hand-picked list"
              onPress={() => {
                const id = menuFor.id;
                setMenuFor(null);
                openGroup({ checkpointId: id });
              }}
            />
            <SheetOption
              icon={menuFor.active ? "pause-circle-outline" : "play-circle-outline"}
              label={menuFor.active ? "Switch off" : "Switch back on"}
              hint={menuFor.active ? "Stops new registers; keeps history" : "Registers are made again from today"}
              onPress={() => toggleActive(menuFor)}
            />
            <SheetOption icon="trash-outline" label="Remove checkpoint" danger onPress={() => confirmRemove(menuFor)} />
          </>
        )}
      </BottomSheet>

      {/* A class's day */}
      <BottomSheet
        visible={!!classOpen}
        onClose={() => setClassOpen(null)}
        title={classOpen ? `Class ${classOpen.label}` : ""}
        subtitle={classOpen ? `${plural(classOpen.students, "student")} · today's checkpoints` : ""}
        showClose
      >
        {!!classOpen &&
          ((coverage[classOpen.key] || []).length ? (
            (coverage[classOpen.key] || []).map((d) => (
              <SheetOption
                key={d.id}
                icon="time-outline"
                label={`${d.checkpoint} · ${fmtTime(d.start)}`}
                hint={`${d.group} · ${staffName(d.staffId) || "Unassigned"}`}
              />
            ))
          ) : (
            <Text style={[typography.caption, styles.viewHint]}>
              No register includes this class today.
            </Text>
          ))}
        {!!classOpen && (
          <PrimaryButton
            title="Add a checkpoint for this class"
            icon="add"
            onPress={() => {
              const key = classOpen.key;
              setClassOpen(null);
              openGroup({ classKey: key });
            }}
            style={{ marginTop: spacing.sm }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

/**
 * One checkpoint. Deliberately quiet: the time and the name carry the card,
 * each group is one line, and everything secondary is an icon or a muted
 * word. The first version stacked a boxed time badge, a pill, a sentence
 * about built-in registers and a "+ Add group" link on every card, and the
 * list read as a wall of text.
 */
function CheckpointCard({ cp, groups, builtin, staffName, onMenu, onOpenGroup, onAddGroup }) {
  // One short fact, in priority order: the groups set here, else the
  // registers the nightly job makes from the class list.
  const meta = groups.length
    ? plural(groups.length, "group")
    : builtin.classes > 0
      ? `${plural(builtin.classes, "register")} made automatically`
      : null;
  const empty = !groups.length && !builtin.classes;

  return (
    <View style={[styles.card, !cp.active && styles.cardOff]}>
      <View style={styles.cardTop}>
        <View style={styles.timeCol}>
          <Text style={styles.timeStart}>{fmtTime(cp.start)}</Text>
          <Text style={styles.timeEnd}>{fmtTime(cp.end)}</Text>
        </View>
        <View style={styles.cardTitleCol}>
          <View style={styles.titleRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {cp.name}
            </Text>
            {cp.mandatoryEscalation && (
              <Ionicons
                name="alert-circle"
                size={15}
                color={colors.warning}
                accessibilityLabel="Missed register goes straight to the Principal"
              />
            )}
          </View>
          <Text style={[styles.cardMeta, empty && { color: colors.warning }]} numberOfLines={1}>
            {!cp.active ? "Switched off" : empty ? "No groups yet" : meta}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onAddGroup}
          style={styles.iconBtn}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={`Add a group to ${cp.name}`}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onMenu}
          style={styles.iconBtn}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${cp.name}`}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.icon} />
        </TouchableOpacity>
      </View>

      {groups.length > 0 && (
        <View style={styles.groups}>
          {groups.map((g) => (
            <TouchableOpacity
              key={g.id}
              onPress={() => onOpenGroup(g)}
              style={styles.groupRow}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${g.label}, marked by ${staffName(g.staffId) || "a coordinator"}. Edit`}
            >
              <Text style={styles.groupName} numberOfLines={1}>
                {g.label}
              </Text>
              <Text style={styles.groupWho} numberOfLines={1}>
                {staffName(g.staffId) || "Unassigned"}
              </Text>
              <Text style={styles.groupDays}>{daysLabel(g.days)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export function BackButton({ onPress, label = "Back" }) {
  return (
    <View style={styles.head}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.back}
        hitSlop={layout.hitSlop}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
  head: { paddingBottom: spacing.sm },
  back: {
    width: layout.touch,
    height: layout.touch,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  addBtnText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.onDark },
  views: { marginBottom: spacing.md },
  viewHint: { marginBottom: spacing.sm },
  centered: { alignItems: "center", paddingVertical: 48, gap: spacing.sm },

  card: {
    ...surface.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md - 2,
    marginBottom: spacing.sm,
  },
  cardOff: { opacity: 0.55 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // Plain text, not a boxed badge: the box was the "blocky" part.
  timeCol: { width: 64 },
  timeStart: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.text, ...numeric },
  timeEnd: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.icon, ...numeric },
  cardTitleCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { ...typography.h3, flexShrink: 1 },
  cardMeta: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 1 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  // Groups indent under the name, so the time column stays a clean edge.
  groups: { marginTop: spacing.xs + 2, marginLeft: 64 + spacing.sm },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  groupName: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.text, flexShrink: 1 },
  groupWho: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textMuted, flex: 1, minWidth: 0 },
  groupDays: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, color: colors.icon },

  classRow: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 4,
    borderRadius: radius.md,
    minHeight: layout.row - 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  classCount: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted, ...numeric },
  classBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  classBadgeShort: { backgroundColor: colors.warningBg },
  classBadgeText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.primary, ...numeric },
  classMain: { flex: 1, minWidth: 0, gap: 1 },

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
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timeInput: { flex: 1, textAlign: "center", ...numeric },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  problem: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
});
