import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, shadow, layout } from "../theme/theme";

/**
 * Brief confirmation that an action worked.
 *
 * Every write in this app used to end in one of two ways: a blocking dialog
 * you had to dismiss (submitting attendance), or complete silence (reassigning
 * a duty, saving a phone number, resolving an alert). Neither is right — the
 * first interrupts a teacher mid-round, the second leaves them tapping twice
 * because nothing appeared to happen.
 *
 *   const toast = useToast();
 *   toast.show("Duty reassigned to Ajay Solanki Pr");
 *   toast.show("Couldn't save", { tone: "danger" });
 *
 * Anchored to the TOP: the bottom of every screen is already occupied by the
 * tab bar or the marking screen's submit footer.
 */

const ToastContext = createContext(null);

const TONES = {
  success: { icon: "checkmark-circle", fg: colors.success, bg: colors.successBg },
  danger: { icon: "alert-circle", fg: colors.danger, bg: colors.dangerBg },
  info: { icon: "information-circle", fg: colors.primary, bg: colors.infoBg },
};

const VISIBLE_MS = 2600;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, opts = {}) => {
    if (!message) return;
    // A fresh id restarts the animation even when the same message repeats,
    // so a second save still reads as a second confirmation.
    setToast({ message, tone: opts.tone || "success", id: Date.now() });
  }, []);

  const api = useRef({ show }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {!!toast && <ToastView key={toast.id} {...toast} onDone={() => setToast(null)} />}
    </ToastContext.Provider>
  );
}

function ToastView({ message, tone, onDone }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const t = TONES[tone] || TONES.success;

  useEffect(() => {
    // Native driver: the toast animates on the UI thread, so it stays smooth
    // even while a 300-row list is still committing behind it.
    const enter = Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    });
    // Exit is quicker than entry — a confirmation that lingers reads as an
    // error the user has to deal with.
    const exit = Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true });

    enter.start();
    const timer = setTimeout(() => exit.start(onDone), VISIBLE_MS);
    return () => {
      clearTimeout(timer);
      enter.stop();
      exit.stop();
    };
  }, [anim, onDone]);

  const style = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: Math.max(insets.top, spacing.md) }, style]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onDone}
        style={[styles.toast, { backgroundColor: t.bg }]}
        // Announced without stealing focus from whatever the user is doing.
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessibilityLabel={message}
      >
        <Ionicons name={t.icon} size={18} color={t.fg} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: layout.gutter,
    right: layout.gutter,
    zIndex: 100,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    minHeight: layout.touch,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairlineTop,
    ...shadow.lg,
  },
  text: { ...typography.bodyStrong, flex: 1 },
});
