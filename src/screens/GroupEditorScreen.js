import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  FlatList,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout, surface } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import SearchField from "../components/SearchField";
import { EmptyState, PrimaryButton, SectionLabel, ErrorState } from "../components/ui";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { useScreenTopInset } from "../navigation/tabBarInset";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { canManageRoster, roleLabel } from "../domain/roles";
import { listClasses } from "../domain/classGroups";
import { housesIn } from "../domain/houses";
import { resolveGroup } from "../lib/duties";
import {
  useRoster,
  saveGroup,
  removeGroup,
  COVERAGE,
  coverageOf,
  WEEKDAYS,
  EVERY_DAY,
  SCHOOL_DAYS,
} from "../lib/roster";
import { describeError } from "../lib/errors";
import { haptics } from "../lib/haptics";
import { fmtTime, plural } from "../utils/format";
import { BackButton } from "./CheckpointsScreen";

/**
 * One group of one checkpoint: who is in it, who marks it, on which days.
 *
 * The count at the bottom is the real answer, not a description — it runs the
 * same `resolveGroup` the marking screen will run tomorrow morning, so what a
 * coordinator sees here is exactly the list the teacher will be handed.
 *
 * Students are added and removed two ways, because the school needs both:
 *  - "Pick students" builds a list from nothing (the Remedial batch).
 *  - "Leave out" removes a few children from an otherwise whole group — a
 *    medical exemption from sports — without turning the group into a list
 *    that then has to be maintained by hand every time a child joins the class.
 */

const COVER_CHIPS = [
  { key: COVERAGE.CLASS, label: "A class", icon: "school-outline" },
  { key: COVERAGE.BAND, label: "A band", icon: "layers-outline" },
  { key: COVERAGE.HOUSE, label: "A house", icon: "home-outline" },
  { key: COVERAGE.SCHOOL, label: "Whole school", icon: "globe-outline" },
  { key: COVERAGE.PICK, label: "Pick students", icon: "checkbox-outline" },
];

const BANDS = [
  { key: "Primary", hint: "Grades 2–5" },
  { key: "Middle", hint: "Grades 6–8" },
  { key: "Senior", hint: "Grades 9–12" },
];

export default function GroupEditorScreen({ navigation, route }) {
  const { groupId, checkpointId: initialCheckpoint, classKey: initialClass } = route.params || {};
  const { user } = useAuth();
  const { students, staff, staffName, refresh } = useSchoolData();
  const { checkpoints, groups, loading, error, reload } = useRoster();
  const dialog = useDialog();
  const toast = useToast();
  const topInset = useScreenTopInset();
  const bottom = useSafeAreaInsets().bottom;

  const existing = groups.find((g) => g.id === groupId) || null;
  const classes = useMemo(() => listClasses(students), [students]);
  const houses = useMemo(() => housesIn(students), [students]);

  // The form starts from the saved group once the roster arrives; until then
  // from whatever the caller pre-filled (a checkpoint, or a class).
  const [form, setForm] = useState(null);
  const base = existing
    ? { ...existing, coverage: coverageOf(existing), residential: existing.scope === "res" }
    : {
        id: null,
        checkpointId: initialCheckpoint || null,
        label: "",
        coverage: initialClass ? COVERAGE.CLASS : COVERAGE.BAND,
        classKey: initialClass || null,
        band: initialClass ? null : "Primary",
        house: null,
        members: [],
        excluded: [],
        staffId: null,
        days: SCHOOL_DAYS,
        residential: false,
      };
  const f = form || base;
  const set = (patch) => setForm({ ...f, ...patch });

  const [sheet, setSheet] = useState(null); // "checkpoint" | "class" | "staff" | "pick" | "exclude"
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const checkpoint = checkpoints.find((c) => c.id === f.checkpointId) || null;
  const cls = classes.find((c) => c.key === f.classKey) || null;

  /** What the group would be as a duty, so `resolveGroup` can answer for it. */
  const asDuty = {
    classKey: f.coverage === COVERAGE.CLASS ? f.classKey : null,
    band: f.coverage === COVERAGE.BAND ? f.band : null,
    house: f.coverage === COVERAGE.HOUSE ? f.house : null,
    members: f.coverage === COVERAGE.PICK ? f.members || [] : null,
    excluded: f.coverage === COVERAGE.PICK ? null : f.excluded,
    scope: f.residential ? "res" : "all",
  };
  const covered = useMemo(
    () => resolveGroup(asDuty, students),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, f.coverage, f.classKey, f.band, f.house, f.members, f.excluded, f.residential]
  );
  // The group before exclusions — who "Leave out" chooses from.
  const beforeExclusions = useMemo(
    () => resolveGroup({ ...asDuty, excluded: null }, students),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, f.coverage, f.classKey, f.band, f.house, f.members, f.residential]
  );

  const suggestedLabel = () => {
    const res = f.residential ? " · residential" : "";
    if (f.coverage === COVERAGE.CLASS) return cls ? `Class ${cls.label}` : "";
    if (f.coverage === COVERAGE.BAND) return f.band ? `${f.band}${res}` : "";
    if (f.coverage === COVERAGE.HOUSE) return f.house ? `${f.house} house${res}` : "";
    if (f.coverage === COVERAGE.SCHOOL) return f.residential ? "All residential students" : "Whole school";
    return "";
  };
  const label = f.label.trim() || suggestedLabel();

  const problem = !f.checkpointId
    ? "Choose the checkpoint"
    : f.coverage === COVERAGE.CLASS && !f.classKey
      ? "Choose the class"
      : f.coverage === COVERAGE.HOUSE && !f.house
        ? "Choose the house"
        : f.coverage === COVERAGE.PICK && !(f.members || []).length
          ? "Pick at least one student"
          : !label
            ? "Give the group a name"
            : !f.days.length
              ? "Pick at least one day"
              : covered.length === 0
                ? "Nobody is in this group as it stands"
                : null;

  const markers = useMemo(
    () => (staff || []).filter((s) => !["nurse", "reception"].includes(s.role)),
    [staff]
  );

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      await saveGroup({
        id: f.id,
        checkpointId: f.checkpointId,
        label,
        classKey: asDuty.classKey,
        band: asDuty.band,
        house: asDuty.house,
        members: asDuty.members,
        excluded: asDuty.excluded,
        scope: f.residential ? "res" : "all",
        staffId: f.staffId,
        days: f.days,
      });
      haptics.success();
      toast.show(`${label} saved · on today's roster if it runs today`);
      refresh();
      navigation.goBack();
    } catch (e) {
      const shown = describeError(e, { title: "Group not saved", message: "Nothing was changed. Try again." });
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.title,
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = () =>
    dialog.confirm({
      icon: "trash-outline",
      title: `Remove ${label}?`,
      message:
        "Today's and tomorrow's registers for this group are withdrawn if nobody has started them. " +
        "Registers already filled in stay in the record.",
      confirmLabel: "Remove group",
      destructive: true,
      onConfirm: async () => {
        try {
          await removeGroup(f.id);
          haptics.success();
          toast.show(`${label} removed`);
          refresh();
          navigation.goBack();
        } catch (e) {
          const shown = describeError(e, { title: "Not removed" });
          dialog.alert({ icon: "alert-circle-outline", title: shown.title, message: shown.message, destructive: true });
        }
      },
    });

  const toggleDay = (d) =>
    set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() });

  const toggleIn = (list, adm) => (list.includes(adm) ? list.filter((x) => x !== adm) : [...list, adm]);

  if (!canManageRoster(user?.role)) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={{ paddingTop: topInset, paddingHorizontal: layout.gutter }}>
          <BackButton onPress={() => navigation.goBack()} />
          <EmptyState icon="lock-closed-outline" title="Coordinators only" body="Groups are set by a coordinator or the administrator." />
        </View>
      </SafeAreaView>
    );
  }

  if (groupId && !existing) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={{ paddingTop: topInset, paddingHorizontal: layout.gutter }}>
          <BackButton onPress={() => navigation.goBack()} />
          {error ? (
            <ErrorState error={error} title="Can't load this group" onRetry={reload} />
          ) : loading ? null : (
            <EmptyState icon="help-circle-outline" title="Group not found" body="It may have just been removed by another coordinator." />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Search inside the pick / leave-out sheets.
  const q = query.trim().toLowerCase();
  const pool = sheet === "exclude" ? beforeExclusions : students;
  const chosen = sheet === "exclude" ? f.excluded : f.members || [];
  const searchable = q
    ? pool.filter(
        (s) => s.name.toLowerCase().includes(q) || s.adm.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)
      )
    : // Chosen first so a coordinator can see and undo what they picked.
      [...pool].sort((a, b) => Number(chosen.includes(b.adm)) - Number(chosen.includes(a.adm)));

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingTop: topInset, paddingBottom: 120 + bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <ScreenHeader
          title={label || "Untitled group"}
          subtitle={checkpoint ? `${checkpoint.name} · ${fmtTime(checkpoint.start)}–${fmtTime(checkpoint.end)}` : "Choose a checkpoint"}
        />

        <Section title="Checkpoint">
          <Picker
            icon="time-outline"
            label={checkpoint ? checkpoint.name : "Choose checkpoint"}
            hint={checkpoint ? `${fmtTime(checkpoint.start)}–${fmtTime(checkpoint.end)}` : null}
            onPress={() => setSheet("checkpoint")}
            missing={!checkpoint}
          />
        </Section>

        <Section title="Who is in it">
          <View style={styles.chips}>
            {COVER_CHIPS.map((c) => (
              <Chip
                key={c.key}
                icon={c.icon}
                label={c.label}
                on={f.coverage === c.key}
                onPress={() => set({ coverage: c.key })}
              />
            ))}
          </View>

          {f.coverage === COVERAGE.CLASS && (
            <Picker
              icon="school-outline"
              label={cls ? `Class ${cls.label}` : "Choose class"}
              hint={cls ? plural(cls.students, "student") : null}
              onPress={() => setSheet("class")}
              missing={!cls}
            />
          )}
          {f.coverage === COVERAGE.BAND && (
            <View style={styles.chips}>
              {BANDS.map((b) => (
                <Chip key={b.key} label={`${b.key} · ${b.hint}`} on={f.band === b.key} onPress={() => set({ band: b.key })} />
              ))}
            </View>
          )}
          {f.coverage === COVERAGE.HOUSE && (
            <View style={styles.chips}>
              {houses.map((h) => (
                <Chip key={h} label={h} on={f.house === h} onPress={() => set({ house: h })} />
              ))}
            </View>
          )}
          {f.coverage === COVERAGE.PICK && (
            <Picker
              icon="person-add-outline"
              label={(f.members || []).length ? `${plural(f.members.length, "student")} picked` : "Pick students"}
              onPress={() => {
                setQuery("");
                setSheet("pick");
              }}
              missing={!(f.members || []).length}
            />
          )}

          <View style={styles.switchRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.switchLabel}>Residential only</Text>
            </View>
            <Switch
              value={f.residential}
              onValueChange={(v) => set({ residential: v })}
              trackColor={{ true: colors.primary, false: colors.track }}
              thumbColor={colors.white}
              accessibilityLabel="Residential students only"
            />
          </View>

          {f.coverage !== COVERAGE.PICK && (
            <Picker
              icon="person-remove-outline"
              label={f.excluded.length ? `${plural(f.excluded.length, "student")} left out` : "Leave out students"}
              onPress={() => {
                setQuery("");
                setSheet("exclude");
              }}
            />
          )}
        </Section>

        <Section title="Name">
          <TextInput
            value={f.label}
            onChangeText={(text) => set({ label: text })}
            placeholder={suggestedLabel() || "Remedial batch, Choir…"}
            placeholderTextColor={colors.icon}
            style={styles.input}
            maxLength={60}
            accessibilityLabel="Group name"
          />
        </Section>

        <Section title="Marked by">
          <Picker
            icon="person-outline"
            label={f.staffId ? staffName(f.staffId) : "Not chosen"}
            hint={f.staffId ? null : "A coordinator until you choose"}
            onPress={() => setSheet("staff")}
          />
        </Section>

        <Section title="Days">
          <View style={styles.days}>
            {WEEKDAYS.map((d, i) => (
              <TouchableOpacity
                key={d}
                onPress={() => toggleDay(i)}
                style={[styles.day, f.days.includes(i) && styles.dayOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: f.days.includes(i) }}
                accessibilityLabel={d}
              >
                <Text style={[styles.dayText, f.days.includes(i) && styles.dayTextOn]}>{d.slice(0, 2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.quickDays}>
            <Chip label="Mon–Fri" on={f.days.join() === SCHOOL_DAYS.join()} onPress={() => set({ days: SCHOOL_DAYS })} />
            <Chip label="Every day" on={f.days.length === 7} onPress={() => set({ days: EVERY_DAY })} />
          </View>
        </Section>

        {!!f.id && (
          <TouchableOpacity onPress={confirmRemove} style={styles.removeBtn} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.removeText}>Remove this group</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Sticky footer: the live count and the one action. */}
      <View style={[styles.footer, { paddingBottom: bottom + spacing.sm }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.count}>{plural(covered.length, "student")}</Text>
          <Text style={[typography.caption, problem && { color: colors.danger }]} numberOfLines={1}>
            {problem || (f.days.length === 7 ? "Every day" : `${f.days.length} days a week`)}
          </Text>
        </View>
        <PrimaryButton
          title={saving ? "Saving…" : "Save group"}
          icon="checkmark"
          onPress={save}
          disabled={!!problem || saving}
          style={styles.saveBtn}
        />
      </View>

      <BottomSheet visible={sheet === "checkpoint"} onClose={() => setSheet(null)} title="Checkpoint" showClose>
        {checkpoints.map((c) => (
          <SheetOption
            key={c.id}
            label={c.name}
            hint={`${fmtTime(c.start)}–${fmtTime(c.end)}${c.active ? "" : " · switched off"}`}
            active={c.id === f.checkpointId}
            onPress={() => {
              set({ checkpointId: c.id });
              setSheet(null);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={sheet === "class"} onClose={() => setSheet(null)} title="Class" showClose>
        {classes.map((c) => (
          <SheetOption
            key={c.key}
            icon="school-outline"
            label={`Class ${c.label}`}
            hint={plural(c.students, "student")}
            active={c.key === f.classKey}
            onPress={() => {
              set({ classKey: c.key, excluded: [] });
              setSheet(null);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={sheet === "staff"} onClose={() => setSheet(null)} title="Marked by" showClose>
        <SheetOption
          icon="remove-circle-outline"
          label="Not chosen yet"
          hint="Falls to a coordinator"
          active={!f.staffId}
          onPress={() => {
            set({ staffId: null });
            setSheet(null);
          }}
        />
        {markers.map((s) => (
          <SheetOption
            key={s.id}
            label={s.name}
            hint={roleLabel(s.role) + (s.classLabel ? ` · ${s.classLabel}` : "")}
            active={s.id === f.staffId}
            onPress={() => {
              set({ staffId: s.id });
              setSheet(null);
            }}
          />
        ))}
      </BottomSheet>

      {/* Pick students / leave students out. Same list, different meaning. */}
      <BottomSheet
        visible={sheet === "pick" || sheet === "exclude"}
        onClose={() => setSheet(null)}
        title={sheet === "exclude" ? "Leave out" : "Pick students"}
        subtitle={
          sheet === "exclude"
            ? `${plural(f.excluded.length, "student")} left out of ${beforeExclusions.length}`
            : `${plural((f.members || []).length, "student")} in this group`
        }
        showClose
        scroll={false}
      >
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Name, admission no. or class"
          style={{ marginBottom: spacing.sm }}
        />
        <FlatList
          data={searchable.slice(0, 120)}
          keyExtractor={(s) => s.id}
          style={styles.pickList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="search-outline" title="No match" compact />}
          renderItem={({ item }) => {
            const on = chosen.includes(item.adm);
            return (
              <TouchableOpacity
                style={[styles.pickRow, on && styles.pickRowOn]}
                onPress={() =>
                  sheet === "exclude"
                    ? set({ excluded: toggleIn(f.excluded, item.adm) })
                    : set({ members: toggleIn(f.members || [], item.adm) })
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${item.name}, class ${item.label}`}
              >
                <Ionicons
                  name={on ? (sheet === "exclude" ? "remove-circle" : "checkmark-circle") : "ellipse-outline"}
                  size={22}
                  color={on ? (sheet === "exclude" ? colors.danger : colors.primary) : colors.icon}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    Class {item.label} · {item.adm}
                    {item.type === "D" ? " · day scholar" : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
        <PrimaryButton title="Done" onPress={() => setSheet(null)} style={{ marginTop: spacing.sm }} />
      </BottomSheet>
    </SafeAreaView>
  );
}

function Section({ title, children }) {
  return (
    <>
      <SectionLabel style={styles.sectionLabel}>{title}</SectionLabel>
      <View style={styles.section}>{children}</View>
    </>
  );
}

function Picker({ icon, label, hint, onPress, missing }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.picker, missing && styles.pickerMissing]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint || ""}`}
    >
      <Ionicons name={icon} size={20} color={missing ? colors.warning : colors.text} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.pickerLabel} numberOfLines={1}>
          {label}
        </Text>
        {!!hint && (
          <Text style={typography.caption} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.icon} />
    </TouchableOpacity>
  );
}

function Chip({ label, icon, on, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={label}
    >
      {!!icon && <Ionicons name={icon} size={15} color={on ? colors.onDark : colors.textMuted} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: layout.gutter },
  sectionLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  section: { ...surface.card, borderRadius: radius.md, padding: spacing.sm + 2, gap: spacing.sm },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  chipTextOn: { color: colors.onDark, fontFamily: fonts.semibold },

  picker: {
    ...surface.sunken,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touch,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  pickerLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text },
  pickerMissing: { borderColor: colors.warning, backgroundColor: colors.warningBg },

  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2, paddingHorizontal: 2 },
  switchLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text },

  input: {
    ...surface.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 2,
    minHeight: layout.touch,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },

  days: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  day: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  dayOn: { backgroundColor: colors.primary },
  dayText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  dayTextOn: { color: colors.onDark },
  quickDays: { flexDirection: "row", gap: spacing.xs + 2 },

  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: layout.touch,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
  },
  removeText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.sm,
    backgroundColor: colors.bar,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  count: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.text },
  saveBtn: { minWidth: 150 },

  pickList: { maxHeight: 380 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touch + 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  pickRowOn: { backgroundColor: colors.primarySoft },
});
