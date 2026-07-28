import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../theme/theme";
import { percent } from "../utils/format";

/** Thin completion bar. Guards against divide-by-zero and out-of-range values
 *  so a bad count can never render a broken bar. */
export default function ProgressBar({ done, total, color = colors.success, style }) {
  const pct = Math.min(100, Math.max(0, percent(done, total)));
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, backgroundColor: colors.cardAlt, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
});
