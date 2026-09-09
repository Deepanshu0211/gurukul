import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, layout, loginFonts } from "../theme/theme";
import { PrimaryButton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { submitAccessRequest } from "../lib/access";
import { describeError } from "../lib/errors";

/**
 * Asking for a teacher account.
 *
 * What this screen creates is NOT access. It creates an Auth account, which
 * since migration 012 can read nothing in this database — not a student, not a
 * colleague, not a checkpoint — and an access request for a coordinator to
 * look at. The distinction is the whole design: anyone may ask, asking grants
 * nothing, and the grant is a person's decision recorded against their name.
 *
 * The flow forks on one project setting. With email confirmation ON (this
 * project's setting today), `signUp` returns a user but NO session, so there
 * is no token to file a request with yet — the request is made on first
 * sign-in instead, by the waiting screen. With confirmation off a session
 * comes straight back and the request goes in immediately. Both paths end in
 * the same place, so neither is a special case anyone has to remember.
 */
export default function RegisterScreen({ navigation }) {
  const { resolveSession } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const fail = (msg) => {
    setError(msg);
    return false;
  };

  const validate = () => {
    setError(null);
    if (!name.trim()) return fail("Please enter your full name.");
    if (!email.trim()) return fail("Please enter your email address.");
    // Deliberately loose. The confirmation email is the real check, and a
    // strict pattern here mostly rejects addresses that are actually valid.
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail("That email address looks incomplete.");
    if (password.trim().length < 8) return fail("Choose a password of at least 8 characters.");
    return true;
  };

  const submit = async () => {
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      // The request goes in FIRST, and without needing a token. Email
      // confirmation is on for this project, so `signUp` returns no session —
      // filing the request afterwards, as this did, meant it waited for the
      // teacher to open their email and come back, and the coordinator saw an
      // empty queue in the meantime.
      await submitAccessRequest({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        // Trimmed to match the sign-in screen. If a stray keyboard space were
        // stored here but trimmed there, the account would be created and then
        // never accept the password its owner just chose.
        password: password.trim(),
        // Carried on the Auth user so the waiting screen can pre-fill the
        // request without asking for the same things twice.
        options: { data: { full_name: name.trim(), phone: phone.trim() } },
      });

      if (signUpError) {
        const msg = (signUpError.message || "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          setError("An account already uses that email. Try signing in instead.");
        } else if (msg.includes("rate") || msg.includes("too many")) {
          setError("Too many attempts. Wait a minute and try again.");
        } else {
          setError(describeError(signUpError, { message: signUpError.message }).message);
        }
        return;
      }

      // A session comes back only when confirmation is off. Either way the
      // request is already with the coordinators.
      if (data?.session) {
        await resolveSession(data.session);
        return;
      }
      setSent(true);
    } catch (e) {
      const shown = describeError(e, {
        title: "Could not send the request",
        message: "Something went wrong. Try again in a moment.",
      });
      setError(shown.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={[styles.sheet, styles.centred]}>
          <View style={styles.form}>
            <View style={styles.doneIcon}>
              <Ionicons name="mail-unread-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Request sent</Text>
            <Text style={styles.body}>
              The coordinators can see your request now. Open the confirmation link we sent to{" "}
              {email.trim()} so you can sign in once one of them approves it.
            </Text>
            <PrimaryButton
              title="Back to sign in"
              onPress={() => navigation.goBack()}
              style={{ marginTop: spacing.lg }}
              textStyle={{ fontFamily: loginFonts.bold }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const field = (key, label, props, icon) => (
    <>
      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{label}</Text>
      <View style={[styles.inputRow, focused === key && styles.inputRowFocused]}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(key)}
          onBlur={() => setFocused(null)}
          editable={!submitting}
          {...props}
        />
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.sheet}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
              <Text style={styles.backText}>Sign in</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Request access</Text>

            {!!error && (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {field("name", "FULL NAME", {
              value: name,
              onChangeText: setName,
              placeholder: "Krishna Saha Mt",
              autoCapitalize: "words",
              textContentType: "name",
            }, "person-outline")}

            {field("email", "EMAIL", {
              value: email,
              onChangeText: setEmail,
              placeholder: "you@bgis.org",
              autoCapitalize: "none",
              autoCorrect: false,
              keyboardType: "email-address",
              textContentType: "emailAddress",
            }, "mail-outline")}

            {field("phone", "PHONE (OPTIONAL)", {
              value: phone,
              onChangeText: setPhone,
              placeholder: "For duty reminders",
              keyboardType: "phone-pad",
              textContentType: "telephoneNumber",
            }, "call-outline")}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>PASSWORD</Text>
            <View style={[styles.inputRow, focused === "password" && styles.inputRowFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                editable={!submitting}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <PrimaryButton
              title={submitting ? "Sending…" : "Send request"}
              onPress={submit}
              disabled={submitting}
              style={{ marginTop: spacing.lg }}
              textStyle={{ fontFamily: loginFonts.bold }}
            />
            {submitting && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sheet: {
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.md,
    flexGrow: 1,
    justifyContent: "center",
  },
  centred: { flex: 1, justifyContent: "center" },
  form: { width: "100%", maxWidth: 400, alignSelf: "center" },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: layout.touch,
    gap: 2,
  },
  backText: { fontFamily: loginFonts.semibold, fontSize: 15, color: colors.text },

  title: {
    fontFamily: loginFonts.display,
    fontSize: 28,
    lineHeight: 36,
    color: colors.text,
    marginTop: spacing.sm,
  },
  body: {
    fontFamily: loginFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },

  fieldLabel: {
    fontFamily: loginFonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    letterSpacing: 1.2,
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
  inputRowFocused: { borderColor: colors.primary },
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

});
