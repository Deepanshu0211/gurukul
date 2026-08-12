import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, shadow, layout } from "../theme/theme";

/**
 * The one bottom sheet in the app.
 *
 * There used to be four near-identical copies (status picker, alert
 * resolution, reassign, phone/photo) with three different backdrop colours,
 * three different title sizes, and — more seriously — none of them padded for
 * the home indicator or moved out of the keyboard's way, so the last option
 * and the text inputs were unreachable on gesture-navigation phones.
 *
 *   <BottomSheet visible={!!x} onClose={...} title="…" subtitle="…">
 *     …options…
 *   </BottomSheet>
 *
 * @param scroll  content scrolls inside the sheet when it outgrows the screen
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scroll = true,
  showClose = false,
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Always leave the top of the screen visible so the sheet reads as a layer
  // over the page rather than a full replacement of it.
  const maxHeight = height * 0.86;
  const bottomPad = Math.max(insets.bottom, spacing.md) + spacing.sm;

  const Body = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? {
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: "handled",
        contentContainerStyle: { paddingBottom: bottomPad },
      }
    : { style: { paddingBottom: bottomPad } };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { maxHeight }]}>
            <View style={styles.grip} />

            {(!!title || showClose) && (
              <View style={styles.head}>
                <View style={styles.headText}>
                  {!!title && (
                    <Text style={typography.h1} numberOfLines={2}>
                      {title}
                    </Text>
                  )}
                  {!!subtitle && (
                    <Text style={[typography.caption, styles.subtitle]}>{subtitle}</Text>
                  )}
                </View>
                {showClose && (
                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.closeBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Body {...bodyProps}>{children}</Body>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Standard tappable option row inside a sheet. */
export function SheetOption({ label, hint, icon, active, danger, trailing, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.option, active && styles.optionActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
    >
      {!!icon && (
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      )}
      <View style={styles.optionText}>
        <Text style={[typography.h3, danger && { color: colors.danger }]}>{label}</Text>
        {!!hint && <Text style={typography.caption}>{hint}</Text>}
      </View>
      {trailing ??
        (active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />)}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim },

  sheet: {
    backgroundColor: colors.overlay,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.hairlineTop,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.sm,
    ...shadow.lg,
  },
  grip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },

  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.md },
  headText: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: layout.touch + 8,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: spacing.xs + 2,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { flex: 1, minWidth: 0, gap: 1 },
});
