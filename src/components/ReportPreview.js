import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, layout, typography } from "../theme/theme";
import { EmptyState } from "./ui";

/**
 * The report, opened inside the app.
 *
 * WHY THIS EXISTS
 * The report used to be a PDF written into a folder, and the next step was
 * left to the reader: find the Files app, find the folder, find the file,
 * open it in something. For the staff this is for, every one of those steps
 * is a place to give up. So the report opens HERE, looking like the paper
 * sheet they already know.
 *
 * THE LAYOUT, FOR SOMEONE WHO DOES NOT LIVE ON A PHONE
 *  - One obvious thing to do: a single wide "Send report" button. Sending it
 *    to the office is what most people open this for.
 *  - The two other things, Print and Save, sit under it, smaller, each a word
 *    and an icon — no grid of equal tiles to choose between.
 *  - "Pinch to zoom" is said once, over the page, and then gets out of the way
 *    instead of taking a permanent line of the screen.
 *
 * WHAT IS SHOWN
 * The exact HTML that is printed and shared, laid out at A4 width and scaled
 * to fit, so the screen and the paper can never disagree.
 *
 * @param state  "loading" | "ready" | "empty"
 */
const A4_PX = 794; // 210mm at 96dpi
const PAGE_GAP = 14;
const DESK = "#E8E4DC";

// Screen-only dressing: a sheet of paper on a desk. `@media screen` keeps it
// out of the printed and shared PDF, which is built from the same html.
const SCREEN_CSS = `
@media screen {
  html { background: ${DESK}; }
  body {
    background: #fff;
    width: ${A4_PX}px;
    box-sizing: border-box;
    margin: ${PAGE_GAP}px auto;
    padding: 12mm;
    box-shadow: 0 2px 10px rgba(0,0,0,0.12);
    border-radius: 2px;
  }
}`;

const forScreen = (html) => {
  const head =
    `<meta name="viewport" content="width=${A4_PX + PAGE_GAP * 2}, user-scalable=yes">` +
    `<style>${SCREEN_CSS}</style>`;
  return html.includes("<head>") ? html.replace("<head>", `<head>${head}`) : head + html;
};

export default function ReportPreview(props) {
  // A Modal is its own window on Android. The app's SafeAreaProvider measures
  // the main window, so inside here it reported no status bar and the header
  // slid under the clock. A provider inside the Modal measures this one.
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <PreviewBody {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function PreviewBody({
  state = "loading",
  title,
  subtitle,
  html,
  emptyMessage,
  onClose,
  onShare,
  onPrint,
  onSave,
}) {
  const insets = useSafeAreaInsets();
  // Which action is running, so its button shows a spinner and the others
  // cannot be pressed on top of it.
  const [running, setRunning] = useState(null);
  const screenHtml = useMemo(() => (html ? forScreen(html) : ""), [html]);

  const run = (key, fn) => async () => {
    if (running || !fn) return;
    setRunning(key);
    try {
      await fn();
    } finally {
      setRunning(null);
    }
  };

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.back}
          hitSlop={layout.hitSlop}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Close the report"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
              <Text style={styles.date} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── The page ───────────────────────────────────────────────────── */}
      <View style={styles.paper}>
        {state === "loading" && <Preparing />}

        {state === "empty" && (
          <View style={styles.center}>
            <View style={styles.emptyCard}>
              <EmptyState
                icon="document-text-outline"
                title="Nothing to show yet"
                body={emptyMessage || "No attendance was submitted for these days."}
                compact
              />
            </View>
          </View>
        )}

        {state === "ready" && (
          <>
            {Platform.OS === "web" ? (
              // react-native-webview has no web build; the browser can show
              // the page itself.
              React.createElement("iframe", {
                srcDoc: screenHtml,
                title: title || "Report",
                style: { border: 0, width: "100%", height: "100%", background: DESK },
              })
            ) : (
              <WebView
                originWhitelist={["*"]}
                source={{ html: screenHtml }}
                style={styles.web}
                // Report HTML is static; nothing in it needs script.
                javaScriptEnabled={false}
                setBuiltInZoomControls
                setDisplayZoomControls={false}
                scalesPageToFit
                startInLoadingState
                renderLoading={() => (
                  <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: DESK }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                )}
              />
            )}
            <ZoomHint />
          </>
        )}
      </View>

      {/* ── What to do with it ─────────────────────────────────────────── */}
      {state === "ready" && (
        <View
          style={[
            styles.bar,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.sm },
          ]}
        >
          <TouchableOpacity
            onPress={run("share", onShare)}
            disabled={!!running}
            activeOpacity={0.85}
            style={[styles.send, running && running !== "share" && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="Send the report, by WhatsApp or email"
            accessibilityState={{ disabled: !!running, busy: running === "share" }}
          >
            <View style={styles.sendIcon}>
              {running === "share" ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons name="paper-plane" size={20} color={colors.white} />
              )}
            </View>
            <View style={styles.sendText}>
              <Text style={styles.sendLabel}>Send report</Text>
              <Text style={styles.sendCaption}>WhatsApp, email or Drive</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.white} />
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <Secondary
              icon="print-outline"
              label="Print"
              busy={running === "print"}
              disabled={!!running}
              onPress={run("print", onPrint)}
            />
            {!!onSave && (
              <Secondary
                icon="download-outline"
                label="Save to phone"
                busy={running === "save"}
                disabled={!!running}
                onPress={run("save", onSave)}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/** A blank sheet with a spinner on it: says "a page is coming" in one look. */
function Preparing() {
  return (
    <View style={styles.center}>
      <View style={styles.sheet}>
        {[0.9, 0.6, 1, 1, 0.8, 1, 0.7].map((w, i) => (
          <View key={i} style={[styles.line, { width: `${w * 100}%` }, i === 0 && styles.lineHead]} />
        ))}
        <View style={styles.sheetSpinner}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
      <Text style={styles.loadingText}>Preparing the report…</Text>
    </View>
  );
}

/** "Pinch to zoom", shown over the page for a few seconds and then gone. */
function ZoomHint() {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 250, delay: 400, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [fade]);
  return (
    <Animated.View pointerEvents="none" style={[styles.hint, { opacity: fade }]}>
      <Ionicons name="expand-outline" size={16} color={colors.white} />
      <Text style={styles.hintText}>Pinch with two fingers to zoom in</Text>
    </Animated.View>
  );
}

function Secondary({ icon, label, busy, disabled, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.secondary, disabled && !busy && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name={icon} size={20} color={colors.primary} />
      )}
      <Text style={styles.secondaryLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DESK },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm + 2,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.touch,
    paddingRight: spacing.xs,
  },
  backText: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 20, color: colors.text, includeFontPadding: false },
  headText: {
    flex: 1,
    minWidth: 0,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  title: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 21, color: colors.text, includeFontPadding: false },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  date: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: colors.textMuted, includeFontPadding: false },

  paper: { flex: 1, backgroundColor: DESK },
  web: { flex: 1, backgroundColor: DESK },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  emptyCard: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },

  sheet: {
    width: "70%",
    aspectRatio: 210 / 297,
    backgroundColor: colors.white,
    borderRadius: 3,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  line: { height: 8, borderRadius: 4, backgroundColor: "#EEEAE2" },
  lineHead: { height: 12, marginBottom: spacing.xs },
  sheetSpinner: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 20, color: colors.textMuted, includeFontPadding: false },

  hint: {
    position: "absolute",
    bottom: spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: "rgba(20, 32, 31, 0.82)",
  },
  hintText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: colors.white, includeFontPadding: false },

  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  send: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  sendIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { flex: 1, minWidth: 0 },
  sendLabel: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 21, color: colors.white, includeFontPadding: false },
  sendCaption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: colors.white, opacity: 0.85, includeFontPadding: false },

  secondaryRow: { flexDirection: "row", gap: spacing.sm },
  secondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryLabel: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 19, color: colors.primary, includeFontPadding: false },
  dim: { opacity: 0.45 },
});
