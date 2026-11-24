import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, fonts, layout, surface, shadow, numeric } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import BottomSheet from "../components/BottomSheet";
import Segmented from "../components/Segmented";
import ProgressBar from "../components/ProgressBar";
import { EmptyState, PrimaryButton, SecondaryButton, TextAction, Row, Pill, Stat } from "../components/ui";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { useScreenTopInset } from "../navigation/tabBarInset";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { canAddStudent, canStartClass } from "../domain/roles";
import { listClasses } from "../domain/classGroups";
import { HOUSE_ORDER, housesIn } from "../domain/houses";
import {
  draftsFromSheet,
  importContext,
  validateDrafts,
  importTally,
  rowMessages,
  FIELD_LABEL,
  STUDENT_TYPE_VALUES,
} from "../domain/studentImport";
import {
  saveTemplate,
  pickSpreadsheet,
  readSpreadsheet,
  lookupAdmissions,
  importRows,
  nextFrame,
} from "../lib/studentImport";
import { STUDENT_TYPES } from "../lib/students";
import { describeError } from "../lib/errors";
import { haptics } from "../lib/haptics";
import { plural } from "../utils/format";

/**
 * Adding a whole class — or a whole intake — from a spreadsheet.
 *
 * The flow is three steps on one screen: get the template, fill it in
 * elsewhere, upload it. Nothing is written until the teacher has seen every
 * row in the preview and pressed Import. Every row is checked first against
 * the same rules the database enforces (`domain/studentImport.js` mirrors
 * `add_students`, migration 052), so the preview says exactly which rows will
 * go in, which will not, and what to change. Rows are fixed or removed here,
 * in the app — not by going back to Excel and uploading again.
 *
 * Import sends ready rows in batches of 100 with a progress bar. Rows the
 * server refuses come back with its reason and stay in the list to be fixed
 * and sent again; rows that went in leave the list. A child can never be
 * added twice: the server refuses a number it already has.
 */

const FILTERS = { all: "all", fix: "fix", ready: "ready" };
const typeLabel = Object.fromEntries(STUDENT_TYPES.map((t) => [t.value, t.label]));

export default function BulkAddStudentsScreen({ navigation }) {
  const { user } = useAuth();
  const { students, refresh } = useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const topInset = useScreenTopInset();
  const insets = useSafeAreaInsets();

  const allowed = canAddStudent(user?.role);
  const mayStartClass = canStartClass(user?.role);
  const classes = useMemo(() => listClasses(students), [students]);
  const houses = useMemo(() => [...new Set([...HOUSE_ORDER, ...housesIn(students)])], [students]);
  const ownClass = classes.find((c) => c.key === user?.classKey) || null;

  // "idle" → "reading" → "preview" ⇄ "importing" → (preview with a result)
  const [phase, setPhase] = useState("idle");
  const [busyText, setBusyText] = useState("");
  const [fileName, setFileName] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [known, setKnown] = useState(() => new Map());
  const [ignored, setIgnored] = useState([]);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [filter, setFilter] = useState(FILTERS.all);
  const [editing, setEditing] = useState(null); // draft id
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { added, failed, dutiesError, stopped }
  const [templateBusy, setTemplateBusy] = useState(null);
  const [footerH, setFooterH] = useState(120);

  const ctx = useMemo(
    () => importContext({ students, known, houses, mayStartClass, ownClassKey: user?.classKey }),
    [students, known, houses, mayStartClass, user?.classKey]
  );
  const rows = useMemo(() => validateDrafts(drafts, ctx), [drafts, ctx]);
  const tally = useMemo(() => importTally(rows), [rows]);
  const shown = useMemo(
    () =>
      filter === FILTERS.fix ? rows.filter((r) => !r.ok) : filter === FILTERS.ready ? rows.filter((r) => r.ok) : rows,
    [rows, filter]
  );

  // ── Leaving with unsent work ──────────────────────────────────────────────
  const unsent = phase === "importing" || (phase === "preview" && drafts.length > 0);
  const unsentRef = useRef(unsent);
  unsentRef.current = unsent;
  const importingRef = useRef(false);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!unsentRef.current) return;
        e.preventDefault();
        if (importingRef.current) {
          toast.show("Wait for the import to finish", { tone: "danger" });
          return;
        }
        dialog.confirm({
          icon: "document-text-outline",
          title: "Leave without importing?",
          message: "The students still in the list have not been added. You can upload the file again later.",
          cancelLabel: "Stay",
          confirmLabel: "Leave",
          destructive: true,
          onConfirm: () => navigation.dispatch(e.data.action),
        });
      }),
    [navigation, dialog, toast]
  );

  // ── Template ──────────────────────────────────────────────────────────────
  const downloadTemplate = async (format) => {
    if (templateBusy) return;
    setTemplateBusy(format);
    try {
      const { shared } = await saveTemplate(format, {
        classes: classes.map((c) => c.label),
        houses,
        ownClassLabel: ownClass?.label || null,
        mayStartClass,
      });
      if (!shared) toast.show(`Template downloaded · student-import-template.${format}`);
    } catch (e) {
      const d = describeError(e, { title: "Template not saved", message: e?.message });
      dialog.alert({ icon: "alert-circle-outline", title: d.title, message: d.message });
    } finally {
      setTemplateBusy(null);
    }
  };

  // ── Reading a file ────────────────────────────────────────────────────────
  const failRead = (e, name) => {
    setPhase(drafts.length ? "preview" : "idle");
    const d = describeError(e, {
      title: "Could not read the file",
      message: `“${name || "The file"}” could not be read. Save it as .xlsx or CSV from the template and try again.`,
    });
    dialog.alert({
      icon: d.offline ? "cloud-offline-outline" : "document-text-outline",
      title: d.title,
      message: d.message,
      destructive: !d.offline,
    });
  };

  const chooseFile = async () => {
    let picked;
    try {
      picked = await pickSpreadsheet();
    } catch (e) {
      failRead(e);
      return;
    }
    if (!picked) return;

    setPhase("reading");
    setBusyText(`Reading ${picked.name}…`);
    // Let the spinner paint before the synchronous parse of a big file.
    await nextFrame();
    try {
      const sheet = readSpreadsheet(picked);
      const parsed = draftsFromSheet(sheet);
      if (parsed.problem) throw Object.assign(new Error(parsed.problem), { code: "22023" });

      setBusyText(`Checking ${plural(parsed.drafts.length, "student")} against the register…`);
      await nextFrame();
      let found = new Map();
      let failed = false;
      try {
        found = await lookupAdmissions(parsed.drafts.map((d) => d.values.admissionNo.toUpperCase()));
      } catch {
        // Offline or the lookup was refused. The preview still works from the
        // register already on the phone; the server re-checks on import.
        failed = true;
      }
      setKnown(found);
      setLookupFailed(failed);
      setDrafts(parsed.drafts);
      setIgnored(parsed.ignored || []);
      setFileName(picked.name);
      setResult(null);
      setFilter(FILTERS.all);
      setPhase("preview");
    } catch (e) {
      failRead(e, picked.name);
    }
  };

  // ── Editing and removing rows ─────────────────────────────────────────────
  const saveEdit = async (id, values) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, values, serverError: null } : d)));
    setEditing(null);
    const adm = values.admissionNo.trim().toUpperCase();
    if (adm && !known.has(adm)) {
      try {
        const hit = await lookupAdmissions([adm]);
        if (hit.size) setKnown((prev) => new Map([...prev, ...hit]));
      } catch {
        // The server checks again on import.
      }
    }
  };

  const removeRow = useCallback(
    (row) => {
      haptics.select();
      setDrafts((prev) => prev.filter((d) => d.id !== row.id));
      toast.show(`Row ${row.line} removed`);
    },
    [toast]
  );

  const openRow = useCallback((row) => setEditing(row.id), []);

  const removeAllProblems = () => {
    const n = tally.fix;
    dialog.confirm({
      icon: "trash-outline",
      title: `Remove ${plural(n, "row")} that need fixing?`,
      message: "They are only taken out of this list. Nothing on the register changes.",
      cancelLabel: "Keep them",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () => {
        const keep = new Set(rows.filter((r) => r.ok).map((r) => r.id));
        setDrafts((prev) => prev.filter((d) => keep.has(d.id)));
        setFilter(FILTERS.all);
      },
    });
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const confirmImport = () => {
    const ready = rows.filter((r) => r.ok);
    if (!ready.length) return;
    const newClasses = [...new Set(ready.filter((r) => r.newClass).map((r) => r.classLabel))];
    haptics.warn();
    dialog.confirm({
      icon: "people-outline",
      title: `Add ${plural(ready.length, "student")} to the register?`,
      message:
        (newClasses.length
          ? `This starts ${plural(newClasses.length, "new class", "new classes")}: ${newClasses.join(", ")}. `
          : "") +
        (tally.fix ? `${plural(tally.fix, "row")} that still need fixing will be left in the list. ` : "") +
        "Each student is logged under your name in the activity log.",
      cancelLabel: "Review",
      confirmLabel: "Add students",
      onConfirm: () => runImport(ready),
    });
  };

  const runImport = async (ready) => {
    importingRef.current = true;
    setPhase("importing");
    setProgress({ done: 0, total: ready.length });
    const out = await importRows(ready, {
      onProgress: (done, total) => setProgress({ done, total }),
    });
    importingRef.current = false;

    // Added rows leave the list; refused rows stay with the server's reason.
    setDrafts((prev) =>
      prev
        .filter((d) => !out.added.has(d.id))
        .map((d) => (out.failed.has(d.id) ? { ...d, serverError: out.failed.get(d.id) } : d))
    );
    setResult({
      added: out.added.size,
      failed: out.failed.size,
      notSent: ready.length - out.added.size - out.failed.size,
      dutiesError: out.dutiesError,
      stopped: out.stopped,
    });
    setFilter(FILTERS.all);
    setPhase("preview");

    if (out.added.size) {
      haptics.success();
      // Duties resolve their student lists from the shared register.
      refresh();
      toast.show(`${plural(out.added.size, "student")} added to the register`);
    }
    if (out.stopped) {
      const d = describeError(
        out.stopped,
        { title: "Import stopped", message: out.stopped?.message },
        out.added.size
          ? `${plural(out.added.size, "student")} were added before the connection dropped. The rest are still in the list.`
          : "Nothing was added. The students are still in the list."
      );
      dialog.alert({
        icon: d.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: d.title,
        message: d.message,
        destructive: !d.offline,
      });
    }
  };

  const startOver = () => {
    setDrafts([]);
    setKnown(new Map());
    setIgnored([]);
    setFileName(null);
    setResult(null);
    setPhase("idle");
  };

  // ── Rendering ─────────────────────────────────────────────────────────────
  if (!allowed) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={{ paddingTop: topInset, paddingHorizontal: layout.gutter }}>
          <BackRow onPress={() => navigation.goBack()} />
          <EmptyState
            icon="lock-closed-outline"
            title="Not available"
            body="Students are added by teachers, coordinators and the office."
          />
        </View>
      </SafeAreaView>
    );
  }

  const editingRow = editing ? rows.find((r) => r.id === editing) : null;
  const inPreview = phase === "preview" || phase === "importing";
  const importing = phase === "importing";

  const header = (
    <View style={{ paddingTop: topInset }}>
      <BackRow onPress={() => navigation.goBack()} disabled={importing} />
      <ScreenHeader
        title="Bulk add students"
        subtitle={inPreview && fileName ? fileName : "From an Excel or CSV file"}
        right={
          inPreview && !importing ? (
            <TextAction label="Change file" onPress={chooseFile} accessibilityLabel="Upload a different file" />
          ) : null
        }
      />
      {inPreview && (
        <>
          {!!result && <ResultCard result={result} remaining={rows.length} onDone={() => navigation.goBack()} onAnother={startOver} />}
          {rows.length > 0 && (
            <View style={styles.stats}>
              <Stat value={tally.ready} label="Ready" />
              <View style={styles.statRule} />
              <Stat value={tally.fix} label="Need fixing" tone={tally.fix ? "danger" : undefined} />
              <View style={styles.statRule} />
              <Stat value={tally.warned} label="To check" tone={tally.warned ? "warning" : undefined} />
            </View>
          )}
          {lookupFailed && (
            <Note tone="warning" icon="cloud-offline-outline">
              Could not check these admission numbers against students who have left. The server checks again when you import.
            </Note>
          )}
          {ignored.length > 0 && (
            <Note icon="information-circle-outline">
              Not imported: the {plural(ignored.length, "column")} {ignored.map((h) => `“${h}”`).join(", ")}. Only the template's columns are read.
            </Note>
          )}
          {rows.length > 0 && (
            <Segmented
              style={styles.segmented}
              value={filter}
              onChange={setFilter}
              items={[
                { key: FILTERS.all, label: "All", count: tally.total },
                { key: FILTERS.fix, label: "Fix", count: tally.fix },
                { key: FILTERS.ready, label: "Ready", count: tally.ready },
              ]}
            />
          )}
          {filter === FILTERS.fix && tally.fix > 1 && !importing && (
            <View style={styles.bulkRow}>
              <Text style={[typography.caption, styles.flex]}>Tap a row to correct it.</Text>
              <TextAction label="Remove all" onPress={removeAllProblems} accessibilityLabel="Remove every row that needs fixing" />
            </View>
          )}
        </>
      )}
    </View>
  );

  if (!inPreview) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {phase === "reading" ? (
            <View style={styles.reading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.readingText}>{busyText}</Text>
            </View>
          ) : (
            <Steps
              ownClass={ownClass}
              mayStartClass={mayStartClass}
              templateBusy={templateBusy}
              onTemplate={downloadTemplate}
              onChoose={chooseFile}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: footerH + spacing.md }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={header}
        ListEmptyComponent={
          rows.length === 0 ? (
            result ? null : (
              <EmptyState icon="document-outline" title="No rows left" body="Every row was removed. Choose the file again to start over." compact />
            )
          ) : (
            <EmptyState
              icon={filter === FILTERS.fix ? "checkmark-circle-outline" : "alert-circle-outline"}
              title={filter === FILTERS.fix ? "Nothing to fix" : "No row is ready yet"}
              body={filter === FILTERS.fix ? "Every row is ready to import." : "Fix the rows marked in red, or remove them."}
              compact
            />
          )
        }
        renderItem={({ item }) => (
          <ImportRow row={item} onOpen={openRow} onRemove={removeRow} disabled={importing} />
        )}
      />

      {rows.length > 0 && (
        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          {importing ? (
            <View style={styles.flex}>
              <View style={styles.progressHead}>
                <Text style={typography.bodyStrong}>Adding students…</Text>
                <Text style={[typography.caption, numeric]}>
                  {progress.done} of {progress.total}
                </Text>
              </View>
              <ProgressBar done={progress.done} total={progress.total} style={styles.progress} />
              <Text style={typography.caption}>Keep this screen open until it finishes.</Text>
            </View>
          ) : (
            <View style={styles.flex}>
              <PrimaryButton
                title={tally.ready ? `Import ${plural(tally.ready, "student")}` : "No rows ready to import"}
                icon="cloud-upload-outline"
                onPress={confirmImport}
                disabled={!tally.ready}
              />
              <Text style={[typography.caption, styles.footerNote]} numberOfLines={2}>
                {tally.fix
                  ? `${plural(tally.fix, "row")} with problems will be left out. Tap one to fix it.`
                  : "Every row is ready. Nothing is saved until you import."}
              </Text>
            </View>
          )}
        </View>
      )}

      <EditRowSheet
        row={editingRow}
        houses={ctx.houseNames}
        ownClass={ownClass}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
        onRemove={(row) => {
          setEditing(null);
          removeRow(row);
        }}
        validate={(id, values) =>
          validateDrafts(
            drafts.map((d) => (d.id === id ? { ...d, values, serverError: null } : d)),
            ctx
          ).find((r) => r.id === id)
        }
      />
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function BackRow({ onPress, disabled }) {
  return (
    <View style={styles.head}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={[styles.back, disabled && styles.dim]}
        hitSlop={layout.hitSlop}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

function Steps({ ownClass, mayStartClass, templateBusy, onTemplate, onChoose }) {
  return (
    <View style={styles.card}>
      <Step n={1} title="Download the template">
        <Text style={typography.caption}>
          The Excel template has drop-downs for student type and house, and a sheet explaining each column.
        </Text>
        <View style={styles.templateRow}>
          <TemplateButton
            icon="grid-outline"
            label="Excel (.xlsx)"
            busy={templateBusy === "xlsx"}
            onPress={() => onTemplate("xlsx")}
          />
          <TemplateButton
            icon="document-text-outline"
            label="CSV"
            busy={templateBusy === "csv"}
            onPress={() => onTemplate("csv")}
          />
        </View>
      </Step>
      <Step n={2} title="Fill in one student per row">
        <Text style={typography.caption}>
          Admission No, Student Name and Student Type are required. Leave Roll No blank to give the next free number.
          {ownClass ? ` Leave Grade and Section blank to add to your class, ${ownClass.label}.` : ""}
          {mayStartClass ? "" : " Students can only join classes already on the register."}
        </Text>
      </Step>
      <Step n={3} title="Upload it" last>
        <Text style={typography.caption}>
          Every row is checked first. You see what is wrong and can fix it here — nothing is saved until you press Import.
        </Text>
        <PrimaryButton title="Choose file" icon="folder-open-outline" onPress={onChoose} style={styles.chooseBtn} />
      </Step>
    </View>
  );
}

function Step({ n, title, children, last }) {
  return (
    <View style={[styles.step, !last && styles.stepGap]}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={typography.h3}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

function TemplateButton({ icon, label, busy, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.75}
      style={styles.templateBtn}
      accessibilityRole="button"
      accessibilityLabel={`Download the template as ${label}`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={icon} size={18} color={colors.primary} />
      )}
      <Text style={styles.templateText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Note({ children, icon, tone }) {
  const fg = tone === "warning" ? colors.warning : colors.textMuted;
  const bg = tone === "warning" ? colors.warningBg : colors.cardAlt;
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={fg} />
      <Text style={[typography.caption, styles.flex, { color: fg }]}>{children}</Text>
    </View>
  );
}

function ResultCard({ result, remaining, onDone, onAnother }) {
  const allIn = result.failed === 0 && result.notSent === 0 && remaining === 0;
  return (
    <View style={[styles.card, styles.resultCard]}>
      <View style={styles.resultHead}>
        <Ionicons
          name={allIn ? "checkmark-circle" : result.added ? "alert-circle" : "close-circle"}
          size={22}
          color={allIn ? colors.success : result.added ? colors.warning : colors.danger}
        />
        <Text style={[typography.h2, styles.flex]}>
          {result.added ? `${plural(result.added, "student")} added` : "No students added"}
        </Text>
      </View>
      {result.failed > 0 && (
        <Text style={typography.body}>
          {plural(result.failed, "student was", "students were")} not added — the reason is on each row below. Fix them and import again.
        </Text>
      )}
      {result.notSent > 0 && (
        <Text style={typography.body}>
          {plural(result.notSent, "student was", "students were")} not sent because the import stopped. They are still in the list.
        </Text>
      )}
      {!!result.dutiesError && (
        <Text style={[typography.caption, { color: colors.warning }]}>
          The new class's registers for today could not be built. They will appear with tonight's roster; a coordinator can check the
          Duties list.
        </Text>
      )}
      <View style={styles.resultActions}>
        <SecondaryButton title="Import another file" onPress={onAnother} style={styles.flex} />
        {allIn && <PrimaryButton title="Done" onPress={onDone} style={styles.flex} />}
      </View>
    </View>
  );
}

/** One spreadsheet row. Memoised: a 2,000-row file must scroll without every
 *  row re-rendering when one is edited. */
const ImportRow = React.memo(function ImportRow({ row, onOpen, onRemove, disabled }) {
  const messages = rowMessages(row);
  const c = row.clean;
  const v = row.values;
  const where = row.classLabel ? `Class ${row.classLabel}` : [v.grade, v.section].filter(Boolean).join(" ") || "No class";
  // The remove button is a SIBLING of the tappable row, not inside it: on the
  // web build both are <button>s, and a button inside a button is invalid
  // HTML that browsers re-parent unpredictably.
  return (
    <View style={[styles.rowCard, !row.ok && styles.rowBad]}>
    <Row
      style={styles.rowPress}
      onPress={() => onOpen(row)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Row ${row.line}, ${c.name || "no name"}. ${row.ok ? "Ready" : "Needs fixing"}. Tap to edit.`}
    >
      <View style={styles.rowTop}>
        <View style={[styles.lineBadge, !row.ok && styles.lineBadgeBad]}>
          <Text style={[styles.lineText, !row.ok && { color: colors.danger }]}>{row.line}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong} numberOfLines={1}>
            {c.name || v.name || "No name"}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {[c.admissionNo || "No admission no.", where, c.stype ? typeLabel[c.stype] : null, c.house, c.roll ? `Roll ${c.roll}` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        {row.ok && row.ownClass && <Pill label="Your class" tone="primary" />}
        {row.ok && row.newClass && <Pill label="New class" tone="warning" />}
        <View style={styles.removeSpace} />
      </View>
      {messages.length > 0 && (
        <View style={styles.messages}>
          {messages.map((m, i) => (
            <View key={i} style={styles.message}>
              <Ionicons
                name={m.tone === "danger" ? "alert-circle" : "warning"}
                size={13}
                color={m.tone === "danger" ? colors.danger : colors.warning}
                style={styles.messageIcon}
              />
              <Text style={[typography.caption, styles.flex, { color: m.tone === "danger" ? colors.danger : colors.warning }]}>
                {m.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Row>
    <TouchableOpacity
      onPress={() => onRemove(row)}
      disabled={disabled}
      style={[styles.removeBtn, styles.removeAt]}
      hitSlop={layout.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={`Remove row ${row.line}`}
    >
      <Ionicons name="close" size={16} color={colors.textMuted} />
    </TouchableOpacity>
    </View>
  );
});

const FIELDS = [
  { key: "admissionNo", placeholder: "e.g. 20261042", caps: "characters", max: 20 },
  { key: "name", placeholder: "As on the admission form", caps: "words", max: 80 },
];

function EditRowSheet({ row, houses, ownClass, onClose, onSave, onRemove, validate }) {
  const [values, setValues] = useState(null);
  useEffect(() => {
    setValues(row ? { ...row.values } : null);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = useMemo(() => (row && values ? validate(row.id, values) : null), [row, values, validate]);
  if (!row || !values) return <BottomSheet visible={false} onClose={onClose} />;

  const set = (patch) => setValues((prev) => ({ ...prev, ...patch }));
  const err = (key) => live?.errors?.[key];
  const stypeValue = live?.clean?.stype;

  return (
    <BottomSheet
      visible={!!row}
      onClose={onClose}
      title={`Row ${row.line}`}
      subtitle="Changes apply to this import only."
      showClose
    >
      {FIELDS.map((f) => (
        <Field key={f.key} label={FIELD_LABEL[f.key]} error={err(f.key)}>
          <TextInput
            value={values[f.key]}
            onChangeText={(t) => set({ [f.key]: t })}
            placeholder={f.placeholder}
            placeholderTextColor={colors.icon}
            autoCapitalize={f.caps}
            autoCorrect={false}
            maxLength={f.max}
            style={[styles.input, err(f.key) && styles.inputBad]}
            accessibilityLabel={FIELD_LABEL[f.key]}
          />
        </Field>
      ))}

      <View style={styles.pair}>
        <Field label="Grade" error={err("grade")} style={styles.flex}>
          <TextInput
            value={values.grade}
            onChangeText={(t) => set({ grade: t })}
            placeholder={ownClass ? String(ownClass.grade) : "1–12"}
            placeholderTextColor={colors.icon}
            keyboardType="number-pad"
            maxLength={8}
            style={[styles.input, err("grade") && styles.inputBad]}
            accessibilityLabel="Grade"
          />
        </Field>
        <Field label="Section" error={err("section")} style={styles.flex}>
          <TextInput
            value={values.section}
            onChangeText={(t) => set({ section: t })}
            placeholder={ownClass ? ownClass.key.split("|")[1] : "e.g. A"}
            placeholderTextColor={colors.icon}
            autoCapitalize="characters"
            maxLength={20}
            style={[styles.input, err("section") && styles.inputBad]}
            accessibilityLabel="Section"
          />
        </Field>
      </View>

      <Field label="Student type" error={err("stype")}>
        <Chips
          options={STUDENT_TYPE_VALUES.map((t) => ({ value: t, label: typeLabel[t] || t }))}
          value={stypeValue}
          onChange={(t) => set({ stype: t })}
        />
      </Field>

      <Field label="House (optional)" error={err("house")}>
        <Chips
          options={[{ value: "", label: "None" }, ...houses.map((h) => ({ value: h, label: h }))]}
          value={live?.clean?.house || (values.house ? null : "")}
          onChange={(h) => set({ house: h })}
        />
      </Field>

      <Field label="Roll No (optional)" error={err("roll")}>
        <TextInput
          value={values.roll}
          onChangeText={(t) => set({ roll: t.replace(/[^0-9]/g, "") })}
          placeholder="Blank for the next free number"
          placeholderTextColor={colors.icon}
          keyboardType="number-pad"
          maxLength={4}
          style={[styles.input, err("roll") && styles.inputBad]}
          accessibilityLabel="Roll number"
        />
      </Field>

      {(live?.warnings || []).map((w, i) => (
        <Text key={i} style={[typography.caption, styles.sheetWarn]}>
          {w}
        </Text>
      ))}

      <PrimaryButton
        title={live?.ok ? "Save row" : "Save — still needs fixing"}
        icon="checkmark"
        onPress={() => onSave(row.id, values)}
        style={styles.sheetSave}
      />
      <TouchableOpacity
        onPress={() => onRemove(row)}
        style={styles.sheetRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove row ${row.line} from this import`}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.sheetRemoveText}>Remove from this import</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

function Field({ label, error, children, style }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      {children}
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value || "none"}
            onPress={() => onChange(o.value)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: layout.gutter },
  flex: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.4 },

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

  card: {
    ...surface.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  step: { flexDirection: "row", gap: spacing.sm + 3 },
  stepGap: { marginBottom: spacing.lg },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onDark },
  stepBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  templateRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  templateBtn: {
    ...surface.sunken,
    flex: 1,
    minHeight: layout.touch,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
  },
  templateText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  chooseBtn: { marginTop: spacing.sm },

  reading: { ...surface.card, borderRadius: radius.md, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  readingText: { ...typography.body, color: colors.textMuted, textAlign: "center" },

  stats: {
    ...surface.card,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 3,
    marginBottom: spacing.sm,
  },
  statRule: { width: 1, alignSelf: "stretch", backgroundColor: colors.divider },
  segmented: { marginBottom: spacing.sm },
  bulkRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xs },
  note: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    borderRadius: radius.sm,
    padding: spacing.sm + 3,
    marginBottom: spacing.sm,
  },

  resultCard: { gap: spacing.sm },
  resultHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  resultActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },

  rowCard: {
    ...surface.card,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  rowPress: { padding: spacing.sm + 3 },
  rowBad: { borderColor: colors.danger, borderLeftWidth: 3 },
  // Holds the place of the remove button, which sits over the row's top-right.
  removeSpace: { width: 32 },
  removeAt: { position: "absolute", top: spacing.sm + 3 + 2, right: spacing.sm + 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineBadge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.xs,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeBad: { backgroundColor: colors.dangerBg },
  lineText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, ...numeric },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardAlt,
  },
  messages: { marginTop: spacing.sm, gap: spacing.xs, paddingLeft: 36 + spacing.sm },
  message: { flexDirection: "row", gap: spacing.xs + 2, alignItems: "flex-start" },
  messageIcon: { marginTop: 2 },

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
    ...shadow.lg,
  },
  footerNote: { textAlign: "center", marginTop: spacing.xs + 2 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  progress: { marginVertical: spacing.sm, backgroundColor: colors.cardAlt },

  label: { ...typography.label, marginBottom: spacing.xs + 2 },
  input: {
    ...surface.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 2,
    minHeight: layout.touch,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputBad: { borderColor: colors.danger },
  fieldError: { ...typography.caption, color: colors.danger, marginTop: -spacing.xs, marginBottom: spacing.sm },
  pair: { flexDirection: "row", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2, marginBottom: spacing.sm },
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
  sheetWarn: { color: colors.warning, marginBottom: spacing.xs },
  sheetSave: { marginTop: spacing.sm },
  sheetRemove: {
    minHeight: layout.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  sheetRemoveText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.danger },
});
