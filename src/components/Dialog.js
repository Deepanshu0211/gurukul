import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, layout, shadow } from "../theme/theme";

/**
 * Replaces React Native's Alert.alert, which renders the platform's stock
 * dialog (blue Material text on Android) and ignores the app's design system
 * entirely. Same call shape, styled to match everything else.
 *
 *   const dialog = useDialog();
 *   dialog.alert({ title, message });
 *   dialog.confirm({ title, message, confirmLabel, destructive, onConfirm });
 */
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [config, setConfig] = useState(null);

  const close = useCallback(() => setConfig(null), []);

  // Stable across renders: screens put `dialog` in useCallback dependency
  // lists, and a fresh object each render would invalidate their memoisation
  // every time a dialog opened or closed.
  const api = useRef({
    alert: (opts) => setConfig({ ...opts, kind: "alert" }),
    confirm: (opts) => setConfig({ ...opts, kind: "confirm" }),
  }).current;

  const handleConfirm = () => {
    const fn = config?.onConfirm;
    close();
    // Let the dialog finish dismissing before the action runs, so a screen
    // change doesn't fight the closing animation.
    if (fn) setTimeout(fn, 0);
  };

  const isConfirm = config?.kind === "confirm";

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal visible={!!config} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Stops a tap inside the card from closing the dialog. */}
          <Pressable onPress={() => {}} style={styles.cardWrap}>
            <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
              {!!config?.icon && (
                <View style={[styles.iconWrap, config.destructive && styles.iconWrapDanger]}>
                  <Ionicons
                    name={config.icon}
                    size={20}
                    color={config.destructive ? colors.danger : colors.primary}
                  />
                </View>
              )}

              <Text style={styles.title}>{config?.title}</Text>
              {!!config?.message && <Text style={styles.message}>{config.message}</Text>}

              <View style={styles.actions}>
                {isConfirm && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={close}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelText}>{config?.cancelLabel || "Cancel"}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.confirmBtn, config?.destructive && styles.confirmBtnDanger]}
                  onPress={isConfirm ? handleConfirm : close}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmText}>
                    {config?.confirmLabel || (isConfirm ? "Confirm" : "Got it")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  cardWrap: { width: "100%", maxWidth: 340 },
  card: {
    backgroundColor: colors.overlay,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairlineTop,
    padding: spacing.lg - 4,
    ...shadow.lg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md - 4,
  },
  iconWrapDanger: { backgroundColor: colors.dangerBg },

  title: { ...typography.h2, letterSpacing: -0.2 },
  message: { ...typography.caption, fontSize: 13, lineHeight: 19, marginTop: spacing.xs + 2 },

  // Buttons share one height so the pair reads as a single control strip.
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg - 4 },
  cancelBtn: {
    flex: 1,
    minHeight: layout.touch,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelText: { ...typography.h3, fontSize: 14 },
  confirmBtn: {
    flex: 1,
    minHeight: layout.touch,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  confirmBtnDanger: { backgroundColor: colors.danger },
  confirmText: { ...typography.h3, fontSize: 14, color: colors.white },
});
