import React from "react";
import { View, Text, StyleSheet, Platform, Share } from "react-native";
import BottomSheet from "./BottomSheet";
import { PrimaryButton, SecondaryButton } from "./ui";
import { useToast } from "./Toast";
import { colors, spacing, radius, typography, fonts } from "../theme/theme";
import { loginDetailsText } from "../lib/staff";

/**
 * The ID and temporary password a coordinator hands to a staff member
 * (migration 048), with one button that copies — or on a phone, shares — the
 * whole block, ready to paste into a chat.
 *
 *   details = { name, email, password }
 */
export async function copyOrShare(text, toast) {
  if (Platform.OS === "web") {
    try {
      await navigator.clipboard.writeText(text);
      toast?.show("Login details copied");
      return;
    } catch {
      // Some browsers (and embedded views) refuse the async clipboard; the
      // old select-and-copy still works there.
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        if (ok) {
          toast?.show("Login details copied");
          return;
        }
      } catch {
        // Fall through.
      }
      toast?.show("Could not copy — select the text above instead", { tone: "danger" });
      return;
    }
  }
  try {
    // The phone's share sheet has "Copy" in it, plus WhatsApp and SMS.
    await Share.share({ message: text });
  } catch {
    toast?.show("Could not open sharing — select the text instead", { tone: "danger" });
  }
}

export default function LoginDetailsSheet({ details, onClose, title = "Login details" }) {
  const toast = useToast();
  const text = details ? loginDetailsText(details) : "";

  return (
    <BottomSheet
      visible={!!details}
      onClose={onClose}
      title={title}
      subtitle={details ? `Give these to ${details.name}. They choose their own password on first sign-in.` : ""}
      showClose
    >
      {!!details && (
        <>
          <View style={styles.box}>
            <Text style={styles.label}>ID (email)</Text>
            <Text style={styles.value} selectable>
              {details.email}
            </Text>
            <Text style={[styles.label, { marginTop: spacing.sm }]}>Temporary password</Text>
            <Text style={[styles.value, styles.password]} selectable>
              {details.password}
            </Text>
          </View>
          <Text style={[typography.caption, styles.note]}>
            This password works until they replace it. After that nobody — you included — can see
            their password; you can only give them a new temporary one.
          </Text>
          <PrimaryButton
            title={Platform.OS === "web" ? "Copy login details" : "Copy / share login details"}
            icon="copy-outline"
            onPress={() => copyOrShare(text, toast)}
            style={{ marginTop: spacing.md }}
          />
          <SecondaryButton title="Done" onPress={onClose} style={{ marginTop: spacing.sm }} />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  label: { ...typography.caption },
  value: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  password: { fontSize: 20, lineHeight: 26, letterSpacing: 1 },
  note: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
