import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout, surface } from "../theme/theme";
import BottomSheet, { SheetOption } from "./BottomSheet";
import { PrimaryButton } from "./ui";
import { useDialog } from "./Dialog";
import { useToast } from "./Toast";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { canStartClass } from "../domain/roles";
import { listClasses } from "../domain/classGroups";
import { housesIn } from "../domain/houses";
import { addStudent, STUDENT_TYPES } from "../lib/students";
import { describeError } from "../lib/errors";
import { haptics } from "../lib/haptics";
import { plural } from "../utils/format";

/**
 * Adding one student to the register. Used from the Roster's Students tab
 * (coordinator, management, admin) and from Account (teachers, who have no
 * Roster tab). Two screens, so it lives here rather than in either.
 *
 * A teacher picks from the classes that already exist and starts on their own
 * class when they have one; a coordinator can also type a new section, which
 * is the one thing `add_student` (037) refuses a teacher.
 *
 *   <AddStudentSheet visible={open} onClose={() => setOpen(false)} onAdded={reload} />
 */
const blank = (classKey) => ({
  admissionNo: "",
  name: "",
  classKey: classKey || null,
  newGrade: "",
  newSection: "",
  stype: "Residential",
  house: null,
  roll: "",
});

export default function AddStudentSheet({ visible, onClose, onAdded }) {
  const { user } = useAuth();
  const { students, refresh } = useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const classes = useMemo(() => listClasses(students), [students]);
  const houses = useMemo(() => housesIn(students), [students]);
  const mayStartClass = canStartClass(user?.role);
  const ownClass = classes.some((c) => c.key === user?.classKey) ? user.classKey : null;

  const [f, setF] = useState(blank(ownClass));
  const [picking, setPicking] = useState(null); // "class" | "house"
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (patch) => {
    setTouched(true);
    setF((prev) => ({ ...prev, ...patch }));
  };

  // A fresh form every time it opens, on the teacher's own class.
  useEffect(() => {
    if (visible) {
      setF(blank(ownClass));
      setTouched(false);
      setPicking(null);
    }
  }, [visible, ownClass]);

  const creating = f.classKey === "__new__";
  const cls = classes.find((c) => c.key === f.classKey) || null;
  const grade = creating ? Number(f.newGrade) : cls?.grade;
  const section = creating ? f.newSection.trim().toUpperCase() : cls?.key.split("|")[1];
  const adm = f.admissionNo.trim().toUpperCase();
  const takenBy = students.find((s) => s.adm.toUpperCase() === adm);

  const problem = !/^[A-Z0-9/-]{3,20}$/.test(adm)
    ? "Admission number: 3–20 letters or digits, as on the register"
    : takenBy
      ? `${adm} already belongs to ${takenBy.name} (${takenBy.label})`
      : f.name.trim().length < 2
        ? "Enter the student's full name"
        : !f.classKey
          ? "Choose the class"
          : creating && !(grade >= 1 && grade <= 12)
            ? "New class: grade 1 to 12"
            : creating && !section
              ? "New class: enter the section"
              : f.roll && !(Number(f.roll) >= 1 && Number(f.roll) <= 999)
                ? "Roll number must be 1–999, or leave it blank"
                : null;

  const nextRoll = cls
    ? Math.max(0, ...students.filter((s) => s.key === cls.key).map((s) => s.roll || 0)) + 1
    : 1;

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      const made = await addStudent({
        admissionNo: adm,
        name: f.name.trim(),
        grade,
        section,
        stype: f.stype,
        house: f.house,
        roll: f.roll ? Number(f.roll) : null,
      });
      haptics.success();
      toast.show(`${made.name} added to Class ${made.label} · roll ${made.roll}`);
      onClose();
      // The marking screens read the context's copy; the Roster's register
      // has its own. Both, or the child is on one list and not the other.
      refresh();
      onAdded?.(made);
    } catch (e) {
      const shown = describeError(e, { title: "Student not added", message: "Nothing was saved. Try again." });
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.title,
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BottomSheet
        visible={visible && !picking}
        onClose={() => !busy && onClose()}
        title="Add a student"
        subtitle="Logged under your name."
        showClose
      >
        <Text style={styles.label}>Admission number</Text>
        <TextInput
          value={f.admissionNo}
          onChangeText={(v) => set({ admissionNo: v })}
          placeholder="e.g. 20261042"
          placeholderTextColor={colors.icon}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          style={styles.input}
          accessibilityLabel="Admission number"
        />
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={f.name}
          onChangeText={(v) => set({ name: v })}
          placeholder="As on the admission form"
          placeholderTextColor={colors.icon}
          autoCapitalize="words"
          maxLength={80}
          style={styles.input}
          accessibilityLabel="Full name"
        />

        <SheetOption
          icon="school-outline"
          label={creating ? "New class" : cls ? `Class ${cls.label}` : "Choose class"}
          hint={
            creating
              ? "Grade and section below"
              : cls
                ? plural(cls.students, "student")
                : null
          }
          onPress={() => setPicking("class")}
          trailing={<Ionicons name="chevron-forward" size={16} color={colors.icon} />}
        />
        {creating && (
          <View style={styles.row}>
            <TextInput
              value={f.newGrade}
              onChangeText={(v) => set({ newGrade: v.replace(/[^0-9]/g, "") })}
              placeholder="Grade"
              placeholderTextColor={colors.icon}
              keyboardType="number-pad"
              maxLength={2}
              style={[styles.input, styles.half]}
              accessibilityLabel="Grade"
            />
            <TextInput
              value={f.newSection}
              onChangeText={(v) => set({ newSection: v })}
              placeholder="Section (e.g. KRISHNA)"
              placeholderTextColor={colors.icon}
              autoCapitalize="characters"
              maxLength={20}
              style={[styles.input, styles.half]}
              accessibilityLabel="Section"
            />
          </View>
        )}

        <Text style={styles.label}>Student type</Text>
        <View style={styles.chips}>
          {STUDENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              onPress={() => set({ stype: t.value })}
              style={[styles.chip, f.stype === t.value && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: f.stype === t.value }}
              accessibilityLabel={`${t.label}. ${t.hint}`}
            >
              <Text style={[styles.chipText, f.stype === t.value && styles.chipTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SheetOption
          icon="home-outline"
          label={f.house || "No house yet"}
          onPress={() => setPicking("house")}
          trailing={<Ionicons name="chevron-forward" size={16} color={colors.icon} />}
        />

        <Text style={styles.label}>Roll number (optional)</Text>
        <TextInput
          value={f.roll}
          onChangeText={(v) => set({ roll: v.replace(/[^0-9]/g, "") })}
          placeholder={`Leave blank for ${nextRoll}`}
          placeholderTextColor={colors.icon}
          keyboardType="number-pad"
          maxLength={3}
          style={styles.input}
          accessibilityLabel="Roll number"
        />

        {touched && !!problem && <Text style={styles.problem}>{problem}</Text>}
        <PrimaryButton
          title={busy ? "Adding…" : "Add student"}
          icon="person-add-outline"
          onPress={submit}
          disabled={!!problem || busy}
          style={{ marginTop: spacing.sm }}
        />
      </BottomSheet>

      <BottomSheet
        visible={visible && picking === "class"}
        onClose={() => setPicking(null)}
        title="Class"
        subtitle={mayStartClass ? undefined : "A new class is started by a coordinator."}
        showClose
      >
        {classes.map((c) => (
          <SheetOption
            key={c.key}
            icon="school-outline"
            label={`Class ${c.label}`}
            hint={`${plural(c.students, "student")}${c.key === ownClass ? " · your class" : ""}`}
            active={c.key === f.classKey}
            onPress={() => {
              set({ classKey: c.key });
              setPicking(null);
            }}
          />
        ))}
        {mayStartClass && (
          <SheetOption
            icon="add-circle-outline"
            label="Start a new class"
            hint="A grade and section with nobody in it yet"
            active={creating}
            onPress={() => {
              set({ classKey: "__new__" });
              setPicking(null);
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet visible={visible && picking === "house"} onClose={() => setPicking(null)} title="House" showClose>
        <SheetOption
          icon="remove-circle-outline"
          label="No house yet"
          active={!f.house}
          onPress={() => {
            set({ house: null });
            setPicking(null);
          }}
        />
        {houses.map((h) => (
          <SheetOption
            key={h}
            icon="home-outline"
            label={h}
            active={f.house === h}
            onPress={() => {
              set({ house: h });
              setPicking(null);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, marginBottom: spacing.xs + 2 },
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
  row: { flexDirection: "row", gap: spacing.sm },
  half: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2, marginBottom: spacing.md },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  chipTextOn: { color: colors.onDark, fontFamily: fonts.semibold },
  problem: { ...typography.caption, color: colors.danger, marginBottom: spacing.xs },
});
