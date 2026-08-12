import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { colors, spacing, radius, fonts, surface } from "../theme/theme";
import { haptics } from "../lib/haptics";

/**
 * Two-to-three way switch between views of the same list — "My duties /
 * Whole school", "Duties / Staff / Students".
 *
 * The selection is a single teal pill that SLIDES between segments rather than
 * appearing under the new one. With an instant swap there is no direction to
 * the change, and on the Roster — where the three tabs show completely
 * different lists — that made the whole screen look like it had been replaced
 * rather than moved along.
 *
 * The pill is one absolutely-positioned view driven by a spring on translateX,
 * so it runs on the UI thread and the labels above it never re-layout.
 */
const PAD = 4;

export default function Segmented({ items, value, onChange, style }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const x = useRef(new Animated.Value(0)).current;

  const segW = width > 0 ? (width - PAD * 2) / items.length : 0;

  useEffect(() => {
    if (!segW) return;
    const anim = Animated.spring(x, {
      toValue: index * segW,
      // Just short of critically damped: it arrives quickly and settles
      // without the wobble that makes a control feel like a toy.
      damping: 20,
      stiffness: 220,
      mass: 0.7,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, segW, x]);

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {segW > 0 && (
        <Animated.View
          style={[styles.pill, { width: segW, transform: [{ translateX: x }] }]}
          pointerEvents="none"
        />
      )}
      {/* The pill and the labels are explicitly layered. An absolutely
          positioned view paints ABOVE its in-flow siblings on the web build
          whatever the source order says, and a teal pill drawn over the label
          it is supposed to sit behind hides that label completely. */}

      {items.map((item) => {
        const active = item.key === value;
        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => {
              if (item.key !== value) haptics.select();
              onChange(item.key);
            }}
            style={styles.segment}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.count != null && (
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>
                  {item.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...surface.sunken,
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: PAD,
  },
  pill: {
    position: "absolute",
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    zIndex: 0,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    zIndex: 1,
  },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  labelActive: { fontFamily: fonts.bold, color: colors.onDark },

  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countActive: { backgroundColor: "rgba(255, 255, 255, 0.22)", borderColor: "transparent" },
  countText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  countTextActive: { color: colors.onDark },
});
