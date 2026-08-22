import React, { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, layout, surface } from "../theme/theme";

/**
 * The one search control in the app.
 *
 * Three screens had grown their own copy of "icon + TextInput + clear button",
 * each with a different height, radius and placeholder colour. This is the
 * single version, and it fixes what the copies got wrong:
 *
 *  - It is meant to be PINNED by its screen, not put inside a list header.
 *    On a 415-row register the field scrolled away on the first flick, so the
 *    only way to change a query was to scroll back to the top.
 *  - Focus is shown by a real state change (primary border + soft ring), not
 *    by the platform's own outline, which react-native-web draws as a square
 *    box around a pill and which Android does not draw at all.
 *  - The whole field is a tap target, not just the 14pt of text inside it.
 *  - `hint` shows the result count in the field itself ("12 of 415"), so the
 *    answer to "did my query do anything?" is where the eye already is.
 *
 * Clearing returns focus to the input rather than dismissing the keyboard —
 * a teacher clearing a mistyped name is about to type another one.
 */
export default function SearchField({
  value,
  onChangeText,
  placeholder,
  hint,
  accessibilityLabel,
  autoFocus = false,
  style,
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  // Coerced rather than trusted: an uncontrolled caller passing undefined
  // would crash the whole screen on `.length`, and a search box is not worth
  // a white screen.
  const text = value || "";
  const active = focused || text.length > 0;

  return (
    <View style={[styles.field, focused && styles.fieldFocused, style]}>
      <Ionicons
        name="search"
        size={17}
        color={active ? colors.primary : colors.icon}
        style={styles.leadIcon}
      />

      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        // iOS draws its own clear button inside the field; ours is the one that
        // shows everywhere, so the native one would be a second identical X.
        clearButtonMode="never"
        style={styles.input}
        accessibilityLabel={accessibilityLabel || placeholder}
      />

      {!!hint && text.length > 0 && (
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
      )}

      {text.length > 0 && (
        <TouchableOpacity
          onPress={() => {
            onChangeText("");
            inputRef.current?.focus();
          }}
          hitSlop={layout.hitSlop}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.icon} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    minHeight: layout.touch + 2,
    paddingHorizontal: spacing.md,
  },
  // A 3pt soft ring rather than a thicker border: a border that changes width
  // on focus shifts every glyph beside it by a pixel.
  fieldFocused: {
    borderColor: colors.primary,
    ...Platform.select({
      web: { boxShadow: `0 0 0 3px ${colors.primarySoft}` },
      default: {},
    }),
  },
  leadIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    paddingVertical: 0,
    // Android defaults TextInput to textAlignVertical: "top" — paired with an
    // explicit lineHeight and no vertical padding, that renders glyphs above
    // centre and clips their tops against the pill's rounded edge.
    textAlignVertical: "center",
    ...Platform.select({
      android: { includeFontPadding: false },
      // react-native-web only; ignored on native.
      web: { outlineStyle: "none" },
      default: {},
    }),
  },
  hint: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    flexShrink: 0,
  },
});
