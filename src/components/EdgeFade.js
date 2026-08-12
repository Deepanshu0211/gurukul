import React, { useEffect, useRef, useState, useCallback } from "react";
import { StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * A soft fade over the top edge of a scrolling region.
 *
 * A list clips its content at a hard line, so rows scrolling out were being
 * sliced clean through the middle of a name — half a word left sitting under
 * the header. This lays a short gradient over that boundary so rows dissolve
 * into it instead.
 *
 * It only fades IN once something is actually scrolled under it. Painted
 * permanently, a white haze over a cream background reads as a smudge across
 * the top of a screen that has nothing to hide — which is exactly what it
 * looked like on a short list sitting still.
 *
 *   const { scrolled, onScroll } = useScrolled();
 *   <FlatList onScroll={onScroll} scrollEventThrottle={16} … />
 *   <EdgeFade top={headerH} visible={scrolled} />
 *
 * Always render this AFTER the scrolling view — siblings paint in order, and
 * it has to land on top of the rows to mask them.
 */
export default function EdgeFade({ top = 0, height = 24, visible = true }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 140 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View style={[styles.fade, { top, height, opacity }]} pointerEvents="none">
      <LinearGradient colors={FADE} locations={LOCATIONS} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/**
 * Tracks whether a scroll view has moved off its top. Returned `onScroll` is
 * stable, and state only flips across the threshold — not on every frame of
 * the scroll, which would re-render the list continuously while it moves.
 */
export function useScrolled(threshold = 6) {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(
    (e) => {
      const y = e.nativeEvent.contentOffset.y;
      setScrolled((prev) => (y > threshold !== prev ? y > threshold : prev));
    },
    [threshold]
  );
  // For screens that swap the list under the same scroll handler — a new list
  // starts at its own top, so the fade must not carry over from the old one.
  const reset = useCallback(() => setScrolled(false), []);
  return { scrolled, onScroll, reset };
}

// White rather than a theme colour: it sits on top of the photographic
// background, which runs cream on one side and teal on the other, and a white
// haze is the only thing that reads correctly over both. Held near-solid for
// the first half, then released quickly — a linear ramp reads as a grey smear
// rather than an edge.
const FADE = ["rgba(255, 255, 255, 0.88)", "rgba(255, 255, 255, 0.62)", "rgba(255, 255, 255, 0)"];
const LOCATIONS = [0, 0.5, 1];

const styles = StyleSheet.create({
  fade: { position: "absolute", left: 0, right: 0 },
});
