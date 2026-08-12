import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

/**
 * Entrance motion for list rows and cards.
 *
 * A short rise + fade, staggered down the list, so a screen resolves into
 * place instead of appearing all at once. Deliberately restrained: this runs
 * every time a teacher opens Duties, several times a day, and a long or bouncy
 * animation is charming twice and then it is a delay.
 *
 *   <FadeIn index={index}><Card … /></FadeIn>
 *
 * Both driven properties (opacity, translateY) are native-driver safe, so the
 * animation runs on the UI thread and does not stutter while the list is
 * still mounting rows.
 *
 * @param index  position in the list; each step adds STAGGER ms, capped so a
 *               row 40 deep is not still waiting a second and a half later
 * @param from   distance in px to rise from
 */
const DURATION = 260;
const STAGGER = 45;
const MAX_STAGGER_STEPS = 6;

export default function FadeIn({ children, index = 0, from = 10, style }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index, MAX_STAGGER_STEPS) * STAGGER;
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: DURATION,
      delay,
      // Decelerating: fast off the mark, settling at the end. A linear ramp on
      // a short distance reads as a jump.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, t]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
