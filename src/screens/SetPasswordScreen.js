import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, layout, loginFonts } from "../theme/theme";
import { PrimaryButton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { changeMyTemporaryPassword } from "../lib/staff";
import { passwordProblem } from "../lib/passwords";
import { describeError } from "../lib/errors";

/**
 * First sign-in with a temporary password (migration 048).
 *
 * The whole app for someone whose `must_change_password` is set: a coordinator
 * gave them `Initial@123` or a random password, and they cannot reach a
 * register until they choose their own. Once they do, the temporary one is
 * deleted on the server and the coordinator can no longer see any password
 * for them.
 */
export default function SetPasswordScreen() {
  const { user, logout, updateUser } = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const problem = passwordProblem(pw, confirm);

  const save = async () => {
    if (busy) return;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeMyTemporaryPassword(pw);
      updateUser({ mustChangePassword: false });
    } catch (e) {
      setError(describeError(e, { message: e.message || "Could not save. Try again." }).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (label, value, onChange, a11y) => (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={(t) => {
            onChange(t);
            setError(null);
          }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.icon}
          accessibilityLabel={a11y}
          onSubmitEditing={save}
        />
        <TouchableOpacity
          onPress={() => setShow((s) => !s)}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide password" : "Show password"}
        >
          <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          <View style={styles.icon}>
            <Ionicons name="key-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Choose your password</Text>
          <Text style={styles.body}>
            Welcome{user?.name ? `, ${user.name}` : ""}. You signed in with a temporary password from your
            coordinator. Choose your own now — after this, only you will know it.
          </Text>

          {field("NEW PASSWORD", pw, setPw, "New password")}
          {field("TYPE IT AGAIN", confirm, setConfirm, "Confirm new password")}

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PrimaryButton
            title={busy ? "Saving…" : "Save and continue"}
            icon="checkmark"
            onPress={save}
            disabled={busy}
            style={{ marginTop: spacing.lg }}
          />

          <TouchableOpacity onPress={logout} style={styles.signOut} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
  title: { fontFamily: loginFonts.display, fontSize: 28, lineHeight: 36, color: colors.text },
  body: {
    fontFamily: loginFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  fieldLabel: {
    fontFamily: loginFonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
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
  errorText: { flex: 1, fontFamily: loginFonts.medium, fontSize: 13, lineHeight: 18, color: colors.danger },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  signOutText: { fontFamily: loginFonts.medium, fontSize: 14, color: colors.textMuted },
});
