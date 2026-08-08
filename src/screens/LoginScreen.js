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
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, loginFonts } from "../theme/theme";
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

  const triggerNotification = (msg) => {
    setNotification(msg);
  };

  const handleContinue = async () => {
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
      setError("Signed in, but no staff record found for this account.");
      return;
    }
    login(staffRow);
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

  toastContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 14 : 14,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    elevation: 9999,
  },
  toastContent: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingTop: 6,
    paddingBottom: 0,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
  },
  swipeHandle: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#E5E5E5",
    alignSelf: "center",
    marginBottom: 6,
  },
  toastMainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
  },
  toastIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  toastText: {
    fontSize: 13,
    fontFamily: loginFonts.medium,
    color: colors.text,
    lineHeight: 17,
  },
  toastCloseBtn: {
    padding: 4,
    marginLeft: 6,
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: colors.dangerBg,
    marginHorizontal: -16,
  },
  progressBar: {
    height: "100%",
    backgroundColor: colors.danger,
    borderRadius: 1.5,
  },

  footNote: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: spacing.md },
});