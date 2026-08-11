import React, { createContext, useCallback, useContext, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts } from "../theme/theme";

// Replaces React Native's Alert.alert, which renders the platform's stock
// dialog (blue Material text on Android) and ignores the app's design system
// entirely. Same call shape, styled to match everything else.
//
//   const dialog = useDialog();
//   dialog.alert({ title, message });
//   dialog.confirm({ title, message, confirmLabel, destructive, onConfirm });

import { GlassView } from "./GlassView";

// Replaces React Native's Alert.alert
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [config, setConfig] = useState(null);

  const close = useCallback(() => setConfig(null), []);

  const api = {
    alert: useCallback((opts) => setConfig({ ...opts, kind: "alert" }), []),
    confirm: useCallback((opts) => setConfig({ ...opts, kind: "confirm" }), []),
  };

  const handleConfirm = () => {
    const fn = config?.onConfirm;
    close();
    // Let the dialog finish dismissing before the action runs, so a screen
    // change doesn't fight the closing animation.
    if (fn) setTimeout(fn, 0);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal visible={!!config} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Stops a tap inside the card from closing the dialog. */}
          <Pressable onPress={() => {}}>
            <GlassView style={styles.card} cornerRadius={22}>
              {config?.icon && (
                <View style={[styles.iconWrap, config.destructive && styles.iconWrapDanger]}>
                  <Ionicons
                    name={config.icon}
                    size={20}
                    color={config.destructive ? colors.danger : colors.text}
                  />
                </View>
              )}

              <Text style={styles.title}>{config?.title}</Text>
              {!!config?.message && <Text style={styles.message}>{config.message}</Text>}

              <View style={styles.actions}>
                {config?.kind === "confirm" && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={close} activeOpacity={0.7}>
                    <Text style={styles.cancelText}>{config?.cancelLabel || "Cancel"}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    config?.destructive && styles.confirmBtnDanger,
                    config?.kind === "alert" && { flex: 1 },
                  ]}
                  onPress={config?.kind === "confirm" ? handleConfirm : close}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmText}>
                    {config?.confirmLabel || (config?.kind === "alert" ? "Got it" : "Confirm")}
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassView>
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
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  iconWrapDanger: { backgroundColor: colors.dangerBg },

  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, letterSpacing: -0.2 },
  message: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 4,
  },

  actions: { flexDirection: "row", gap: 8, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  confirmBtnDanger: { backgroundColor: colors.danger },
  confirmText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.white },
});
