import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  PanResponder,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, layout, loginFonts } from "../theme/theme";
import { PrimaryButton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchStaffByEmail } from "../lib/staff";

const { width: SCREEN_W } = Dimensions.get("window");

const HERO_SCALE = 1.2;
const HERO_SIZE = Math.round(SCREEN_W * HERO_SCALE);

// ─────────────────────────────────────────────────────────────
// 100x IMPROVED SWIPEABLE NOTIFICATION TOAST
// Features: PanResponder gesture (swipe up/left/right to dismiss),
// spring entrance physics, drag feedback, countdown progress bar,
// and auto-pause on user interaction.
// ─────────────────────────────────────────────────────────────
function SwipeableToast({ message, onDismiss, duration = 3500 }) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 12);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: -120 })).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const isInteracting = useRef(false);
  const progressAnimation = useRef(null);

  const startDismissTimer = () => {
    progress.setValue(1);
    progressAnimation.current = Animated.timing(progress, {
      toValue: 0,
      duration: duration,
      useNativeDriver: false,
    });
    progressAnimation.current.start(({ finished }) => {
      if (finished && !isInteracting.current) {
        animateOut("up");
      }
    });
  };

  const animateIn = () => {
    pan.setValue({ x: 0, y: -100 });
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        friction: 6,
        tension: 90,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }),
    ]).start(() => {
      startDismissTimer();
    });
  };

  const animateOut = (dir = "up") => {
    let toY = -140;
    let toX = 0;
    if (dir === "left") toX = -SCREEN_W;
    if (dir === "right") toX = SCREEN_W;

    Animated.parallel([
      Animated.timing(pan, {
        toValue: { x: toX, y: toY },
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  useEffect(() => {
    animateIn();
    return () => {
      if (progressAnimation.current) progressAnimation.current.stop();
    };
  }, [message]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        isInteracting.current = true;
        if (progressAnimation.current) progressAnimation.current.stop();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        isInteracting.current = false;
        const { dx, dy, vx, vy } = gestureState;

        if (dy < -20 || vy < -0.3) {
          animateOut("up");
        } else if (dx < -50 || vx < -0.4) {
          animateOut("left");
        } else if (dx > 50 || vx > 0.4) {
          animateOut("right");
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            tension: 100,
            useNativeDriver: false,
          }).start(() => {
            startDismissTimer();
          });
        }
      },
    })
  ).current;

  const progressBarWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toastContainer,
        {
          top: topInset,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
          opacity: opacity,
        },
      ]}
    >
      <View style={styles.toastContent}>
        {/* Swipe Pill Handle */}
        <View style={styles.swipeHandle} />

        <View style={styles.toastMainRow}>
          <View style={styles.toastIconBg}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.toastText}>{message}</Text>
          </View>

          <TouchableOpacity
            onPress={() => animateOut("up")}
            hitSlop={12}
            style={styles.toastCloseBtn}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Minimal Progress Line */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, { width: progressBarWidth }]} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [notification, setNotification] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const triggerNotification = (msg) => {
    setNotification(msg);
  };

  const handleContinue = async () => {
    if (submitting) return;
    if (!email.trim() && !password) {
      triggerNotification("Please enter both your email and password.");
      return;
    }
    if (!email.trim()) {
      triggerNotification("Please enter your email address.");
      return;
    }
    if (!password) {
      triggerNotification("Please enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const msg = (authError.message || "").toLowerCase();
        if (msg.includes("invalid login") || msg.includes("credentials")) {
          triggerNotification("Incorrect email or password.");
        } else if (msg.includes("rate") || msg.includes("too many")) {
          triggerNotification("Too many attempts. Wait a minute and try again.");
        } else if (msg.includes("network") || msg.includes("fetch")) {
          triggerNotification("No connection. Check the device's internet and retry.");
        } else {
          triggerNotification(authError.message);
        }
        return;
      }

      const { data: staffRow, error: staffError } = await supabase
        .from("staff")
        .select("*")
        .eq("email", email.trim())
        .single();
      if (staffError || !staffRow) {
        // This path used to call an undefined `setError`, which crashed the
        // screen instead of telling the user what went wrong.
        triggerNotification("Signed in, but no staff record found for this account.");
        return;
      }
      // Recorded server-side from the caller's own token, so a client can
      // only ever log its own sign-in. Never blocks the login: a failed audit
      // write must not keep a teacher out of the app before a checkpoint.
      supabase.rpc("log_sign_in").catch(() => {});
      login(staffRow);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* 100x Floating Swipeable Notification */}
      {notification && (
        <SwipeableToast
          message={notification}
          onDismiss={() => setNotification(null)}
        />
      )}

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
            <Image
              source={require("../assets/krishna-bgis-blend.png")}
              style={styles.heroImage}
              resizeMode="contain"
              accessibilityLabel="Bhaktivedanta Gurukula and International School"
            />

            <Text style={styles.brandTitle}>BGIS</Text>
            <Text style={styles.brandSubtitle}>
              Bhaktivedanta Gurukula & International School
            </Text>

            <Text style={styles.fieldLabel}>EMAIL</Text>
            <View style={[styles.inputRow, focusedField === "email" && styles.inputRowFocused]}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={focusedField === "email" ? colors.primary : colors.textMuted}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                placeholder="you@bgis.org"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
                style={styles.input}
                accessibilityLabel="Email"
              />
            </View>

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>PASSWORD</Text>
            <View style={[styles.inputRow, focusedField === "password" && styles.inputRowFocused]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={focusedField === "password" ? colors.primary : colors.textMuted}
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
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={handleContinue}
                style={styles.input}
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={layout.hitSlop}
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

            <TouchableOpacity
              style={styles.forgotBtn}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>

            <PrimaryButton
              title={submitting ? "Signing in…" : "Sign in"}
              onPress={handleContinue}
              disabled={submitting}
              style={styles.signInBtn}
              textStyle={{ fontFamily: loginFonts.bold }}
            />

            <Text style={styles.helpText}>
              Need help? <Text style={styles.helpLink}>Contact the school office</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  // One block, one measure, centred. The image, the wordmark, both fields and
  // the button all share this column so nothing on the screen has its own
  // left edge.
  form: { width: "100%", maxWidth: 400, alignSelf: "center" },

  heroImage: {
    width: "100%",
    height: Math.min(220, HERO_SIZE * 0.62),
    alignSelf: "center",
    marginBottom: spacing.sm,
  },
  // Login has its own label style so app-wide typography changes can't
  // alter this screen.
  fieldLabel: {
    fontFamily: loginFonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  fieldLabelSpaced: { marginTop: spacing.md - 4 },
  brandTitle: {
    fontFamily: loginFonts.display,
    fontSize: 30,
    lineHeight: 38,
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  brandSubtitle: {
    fontFamily: loginFonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textAlign: "center",
  },

  sheet: {
    // Same gutter as every other screen in the app.
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.md,
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

  signInBtn: { marginTop: spacing.md },

  forgotBtn: { alignSelf: "flex-end", minHeight: layout.touch, justifyContent: "center" },
  forgotLink: { fontSize: 13, lineHeight: 18, color: colors.primary, fontFamily: loginFonts.semibold },

  helpText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: loginFonts.regular,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  helpLink: { fontFamily: loginFonts.bold, color: colors.text },

  toastContainer: {
    position: "absolute",
    left: layout.gutter,
    right: layout.gutter,
    zIndex: 9999,
  },
  toastContent: {
    backgroundColor: colors.overlay,
    borderRadius: radius.lg,
    paddingTop: spacing.sm - 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.hairlineTop,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    overflow: "hidden",
  },
  swipeHandle: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.sm - 2,
  },
  toastMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
  },
  toastIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  toastText: {
    fontSize: 13,
    fontFamily: loginFonts.medium,
    color: colors.text,
    lineHeight: 17,
  },
  toastCloseBtn: { padding: spacing.xs },
  progressTrack: {
    height: 3,
    backgroundColor: colors.dangerBg,
    // Bleeds to the toast's edges, so it reads as a countdown on the card
    // rather than a stray line inside it.
    marginHorizontal: -spacing.md,
  },
  progressBar: { height: "100%", backgroundColor: colors.danger },
});