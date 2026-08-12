import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import { colors } from "../theme/theme";
import { percent } from "../utils/format";

/**
 * Thin completion bar. Guards against divide-by-zero and out-of-range values
 * so a bad count can never render a broken bar.
 *
 * The fill animates to its new width rather than jumping. Submitting a
 * checkpoint moves this bar while the teacher is looking at it, and the growth
 * is the acknowledgement that the submission landed — a bar that is simply
 * longer next time the screen renders reads as nothing having happened.
 *
 * Width cannot be driven natively, but this is one 6pt bar animating for a
 * quarter of a second, not a list.
 */
export default function ProgressBar({ done, total, color = colors.success, style }) {
  const pct = Math.min(100, Math.max(0, percent(done, total)));
  const w = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    const anim = Animated.timing(w, {
      toValue: pct,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [pct, w]);

  return (
    <View
      style={[styles.track, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total || 0, now: done || 0 }}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: w.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The track sits on the deep teal greeting card by default, so it needs an
  // ink-tinted well; callers on a light surface pass their own via `style`.
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 3 },
});
