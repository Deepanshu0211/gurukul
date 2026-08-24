import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, layout, loginFonts } from "../theme/theme";
import { PrimaryButton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchMyRequest, submitAccessRequest, REQUEST_STATE } from "../lib/access";
import { describeError } from "../lib/errors";
import { fmtClock } from "../utils/format";

/**
 * Signed in, and nobody yet.
 *
 * This is the whole app for an account with no `staff` row. It is not a
 * restricted version of the app — since migration 012 there is nothing behind
 * it to restrict: the only row in the database such an account can read is its
 * own access request.
 *
 * Three things can be true here, and the screen has to be honest about which:
 *
 *   no request   -> the form. Someone confirmed their email and came back.
 *   pending      -> waiting. Say so plainly and give them a way to check.
 *   rejected     -> say that too, with the reason, and let them ask again.
 *
 * The tempting fourth behaviour — poll every few seconds so approval appears
 * by itself — is deliberately not here. It would keep a phone talking to the
 * server all day for an event that happens once, and "Check again" answers the
 * same question at the moment somebody actually wants to know.
 */
export default function PendingScreen() {
  const { pending, logout, refreshSession } = useAuth();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-filled from what they typed at sign-up, so nobody is asked the same
  // three things twice. `user_metadata` is the only place that survived the
  // trip through the confirmation email.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mine, { data: auth }] = await Promise.all([
        fetchMyRequest(),
        supabase.auth.getUser(),
      ]);
      setRequest(mine);
      const meta = auth?.user?.user_metadata || {};
      if (!mine) {
        setName((v) => v || meta.full_name || "");
        setPhone((v) => v || meta.phone || "");
      }
    } catch (e) {
      setError(describeError(e, { message: "Could not check your request." }).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Has a coordinator decided yet? Re-resolving the session is the check:
   *  if a staff row now exists, AuthContext swaps this screen for the app. */
  const checkAgain = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const staff = await refreshSession();
      if (!staff) await load();
    } finally {
      setChecking(false);
    }
  };

  const send = async () => {
    if (submitting) return;
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitAccessRequest({
        name: name.trim(),
        email: pending?.email,
        phone: phone.trim(),
      });
      // The RPC is deliberately silent about what it did, so re-read rather
      // than assume: an address that already belongs to staff writes nothing.
      setRequest(await fetchMyRequest());
    } catch (e) {
      setError(
        describeError(e, { message: "Could not send your request. Try again in a moment." }).message
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signOutRow = (
    <TouchableOpacity
      onPress={logout}
      style={styles.signOut}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
      <Text style={styles.signOutText}>Sign out</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centred]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const state = request?.state;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.sheet}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={checking} onRefresh={checkAgain} tintColor={colors.primary} />
        }
      >
        <View style={styles.form}>
          {state === REQUEST_STATE.PENDING && (
            <>
              <View style={styles.icon}>
                <Ionicons name="hourglass-outline" size={28} color={colors.primary} />
              </View>
              <Text style={styles.title}>Waiting for approval</Text>
              <Text style={styles.body}>
                Your request went to the coordinators on {fmtClock(request.requestedAt)}. Once one
                of them approves it, sign in again and the app opens on your duties.
              </Text>
              <Text style={styles.bodyMuted}>
                Until then this account cannot see any student or staff information.
              </Text>

              <View style={styles.card}>
                <Row label="Name" value={request.name} />
                <Row label="Email" value={request.email} />
                {!!request.phone && <Row label="Phone" value={request.phone} />}
              </View>

              <PrimaryButton
                title={checking ? "Checking…" : "Check again"}
                onPress={checkAgain}
                disabled={checking}
                style={{ marginTop: spacing.lg }}
                textStyle={{ fontFamily: loginFonts.bold }}
              />
            </>
          )}

          {state === REQUEST_STATE.REJECTED && (
            <>
              <View style={[styles.icon, styles.iconDanger]}>
                <Ionicons name="close-circle-outline" size={28} color={colors.danger} />
              </View>
              <Text style={styles.title}>Not approved</Text>
              <Text style={styles.body}>
                A coordinator did not approve this request.
                {request.decisionNote ? ` They wrote: “${request.decisionNote}”` : ""}
              </Text>
              <Text style={styles.bodyMuted}>
                If you think this was a mistake, speak to the school office — then ask again below.
              </Text>
              <PrimaryButton
                title="Ask again"
                onPress={() => setRequest(null)}
                style={{ marginTop: spacing.lg }}
                textStyle={{ fontFamily: loginFonts.bold }}
              />
            </>
          )}

          {!request && (
            <>
              <View style={styles.icon}>
                <Ionicons name="person-add-outline" size={28} color={colors.primary} />
              </View>
              <Text style={styles.title}>Ask for access</Text>
              <Text style={styles.body}>
                Your email is confirmed. Tell the coordinators who you are and they can approve you.
              </Text>

              {!!error && (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Krishna Saha Mt"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  editable={!submitting}
                />
              </View>

              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>PHONE (OPTIONAL)</Text>
              <View style={styles.inputRow}>
                <Ionicons name="call-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="For duty reminders"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  editable={!submitting}
                />
              </View>

              <PrimaryButton
                title={submitting ? "Sending…" : "Send request"}
                onPress={send}
                disabled={submitting}
                style={{ marginTop: spacing.lg }}
                textStyle={{ fontFamily: loginFonts.bold }}
              />
            </>
          )}

          {!!error && state && (
            <Text style={styles.errorInline} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}

          <Text style={styles.account}>Signed in as {pending?.email}</Text>
          {signOutRow}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centred: { alignItems: "center", justifyContent: "center" },
  sheet: {
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.lg,
    flexGrow: 1,
    justifyContent: "center",
  },
  form: { width: "100%", maxWidth: 400, alignSelf: "center" },

  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  iconDanger: { backgroundColor: colors.dangerBg },

  title: { fontFamily: loginFonts.display, fontSize: 28, lineHeight: 36, color: colors.text },
  body: {
    fontFamily: loginFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  bodyMuted: {
    fontFamily: loginFonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  rowLabel: {
    width: 64,
    fontFamily: loginFonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
  },
  rowValue: { flex: 1, fontFamily: loginFonts.medium, fontSize: 14, color: colors.text },

  fieldLabel: {
    fontFamily: loginFonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
  fieldLabelSpaced: { marginTop: spacing.md - 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touch + 8,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderTopColor: colors.hairlineTop,
    borderBottomColor: colors.hairlineBottom,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    marginTop: spacing.sm - 2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: loginFonts.medium,
    color: colors.text,
    padding: 0,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  errorText: {
    flex: 1,
    fontFamily: loginFonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  errorInline: {
    fontFamily: loginFonts.medium,
    fontSize: 13,
    color: colors.danger,
    textAlign: "center",
    marginTop: spacing.md,
  },

  account: {
    fontFamily: loginFonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    minHeight: layout.touch,
  },
  signOutText: { fontFamily: loginFonts.semibold, fontSize: 14, color: colors.textMuted },
});
