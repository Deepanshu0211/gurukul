import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, Image, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, loginFonts } from "../theme/theme";
import { PrimaryButton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchStaffByEmail } from "../lib/staff";

// Square source art (1254x1254), shown whole and centered. Sized against BOTH
// screen dimensions and capped, so the illustration is generous on a big phone
// but shrinks automatically on a short/old display — the goal is the whole
// login fitting without scrolling on typical phones. The ScrollView below is
// the safety net for the smallest screens and for when the keyboard is open.
const { width: SCREEN_W } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────
// ADJUST THIS ONE NUMBER to resize the illustration.
// It's a multiple of the screen width. The whole square image is
// always shown intact — nothing is cropped.
//   0.7 = smaller   1.0 = exactly screen width   1.4 = large
// ─────────────────────────────────────────────────────────────
const HERO_SCALE = 1.2;
const HERO_SIZE = Math.round(SCREEN_W * HERO_SCALE);

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState(null);

  const handleContinue = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter both your email and password.");
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      // Distinguish the real causes — a blanket "wrong password" message hides
      // rate limits and network failures, which need completely different fixes.
      const msg = (authError.message || "").toLowerCase();
      if (msg.includes("invalid login") || msg.includes("credentials")) {
        setError("Incorrect email or password.");
      } else if (msg.includes("rate") || msg.includes("too many")) {
        setError("Too many attempts. Wait a minute and try again.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        setError("No connection. Check the device's internet and retry.");
      } else {
        setError(authError.message);
      }
      return;
    }
    try {
      const staff = await fetchStaffByEmail(email.trim());
      if (!staff) {
        setError("Signed in, but no staff record found for this account.");
        return;
      }
      login(staff);
    } catch {
      setError("Signed in, but no staff record found for this account.");
    }
  };

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
          <Image
            source={require("../assets/krishna-login-square.png")}
            style={styles.heroImage}
            resizeMode="contain"
          />

          <Text style={styles.brandTitle}>Gurukula</Text>
          <Text style={[styles.brandSubtitle, { marginBottom: spacing.md }]}>
            Please sign in to continue.
          </Text>

          <Text style={styles.fieldLabel}>EMAIL</Text>
          <View style={[styles.inputRow, focusedField === "email" && styles.inputRowFocused]}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={focusedField === "email" ? colors.primary : colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="you@gurukula.org"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>PASSWORD</Text>
          <View style={[styles.inputRow, focusedField === "password" && styles.inputRowFocused]}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={focusedField === "password" ? colors.primary : colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              style={styles.input}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={{ alignSelf: "flex-end", marginTop: 10 }}>
            <Text style={styles.forgotLink}>Forgot password?</Text>
          </TouchableOpacity>

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PrimaryButton
            title="Sign in"
            onPress={handleContinue}
            style={styles.signInBtn}
            textStyle={{ fontFamily: loginFonts.bold }}
          />

          <Text style={styles.helpText}>
            Need help? <Text style={styles.helpLink}>Contact the school office</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  heroImage: {
    width: HERO_SIZE,
    height: HERO_SIZE, // square source, shown whole
    alignSelf: "center",
    // The PNG has empty margin baked in around the figure. These negative
    // margins pull the layout back over that dead space without cropping the
    // image itself. Raise the multipliers to tighten further.
    marginTop: -HERO_SIZE * 0.150,
    marginBottom: -HERO_SIZE * 0.1,
  },
  // Login has its own label style so app-wide typography changes can't
  // alter this screen.
  fieldLabel: {
    fontFamily: loginFonts.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.1,
  },
  brandTitle: {
    fontFamily: loginFonts.display,
    fontSize: 30,
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  brandSubtitle: {
    fontFamily: loginFonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },

  sheet: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
    flexGrow: 1,
    // Centres the whole block in whatever space is left, so there's no dead
    // void at the bottom on tall phones. On short phones the content simply
    // exceeds the space and the ScrollView takes over.
    justifyContent: "center",
  },

  // Fully rounded pill shapes throughout — inputs and button share the same
  // soft, even radius so the screen reads as one consistent set of controls.
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 13,
    marginTop: 6,
  },
  inputRowFocused: { borderColor: colors.primary },
  input: { flex: 1, fontSize: 15, fontFamily: loginFonts.medium, color: colors.text, padding: 0 },

  signInBtn: {
    marginTop: spacing.md,
    paddingVertical: 15,
    borderRadius: radius.pill,
  },

  forgotLink: { fontSize: 12.5, color: colors.text, fontFamily: loginFonts.semibold },

  helpText: {
    fontSize: 13,
    fontFamily: loginFonts.regular,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  helpLink: { fontFamily: loginFonts.bold, color: colors.text },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 12.5, fontFamily: loginFonts.medium, flex: 1 },

  footNote: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: spacing.md },
});