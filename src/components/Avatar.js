import React, { useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { colors, fonts, warm } from "../theme/theme";
import { initial } from "../utils/format";

/**
 * Avatar with automatic fallback.
 *
 * Shows the photo when one is available and loads successfully; falls back to
 * the person's initial otherwise. Written against the app's own theme rather
 * than pulling in a component library — the alternatives all require a
 * Tailwind/Reanimated layer for what amounts to a circle with a letter in it.
 *
 *   <Avatar name="Krishna Saha Mt" size={52} />
 *   <Avatar name={...} src={user.photoUrl} bordered status="online" />
 *
 * @param name     used for the fallback initial
 * @param src      optional image URL
 * @param size     diameter in px (default 48)
 * @param bordered draws a ring around the avatar
 * @param status   'online' | 'busy' | 'offline' — small corner dot, optional
 * @param tone     'warm' (greeting card) | 'neutral' (rest of the app)
 */
export default function Avatar({
  name,
  src,
  size = 48,
  bordered = false,
  status,
  tone = "neutral",
  style,
}) {
  // An image that 404s must not leave a blank circle, so failures fall back.
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;

  const isWarm = tone === "warm";
  const dim = { width: size, height: size, borderRadius: size / 2 };
  const ring = bordered
    ? { borderWidth: Math.max(1.5, size * 0.04), borderColor: isWarm ? warm.border : colors.border }
    : null;

  return (
    <View style={[styles.wrap, dim, style]}>
      {showImage ? (
        <Image
          source={{ uri: src }}
          style={[dim, ring, styles.image]}
          onError={() => setFailed(true)}
          accessibilityLabel={name}
        />
      ) : (
        <View
          style={[
            dim,
            ring,
            styles.fallback,
            { backgroundColor: isWarm ? colors.card : colors.cardAlt },
          ]}
        >
          <Text
            style={[
              styles.initial,
              { fontSize: size * 0.4, color: isWarm ? warm.ink : colors.text },
            ]}
          >
            {initial(name)}
          </Text>
        </View>
      )}

      {!!status && (
        <View
          style={[
            styles.status,
            {
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
              borderWidth: Math.max(1.5, size * 0.035),
              backgroundColor: STATUS_COLOR[status] || colors.textMuted,
            },
          ]}
        />
      )}
    </View>
  );
}

const STATUS_COLOR = {
  online: colors.success,
  busy: colors.danger,
  offline: colors.textMuted,
};

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  image: { position: "absolute" },
  fallback: { alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: fonts.bold },
  status: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderColor: colors.white,
  },
});
