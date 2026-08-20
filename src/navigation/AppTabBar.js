import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, spacing, layout, shadow } from "../theme/theme";
import { haptics } from "../lib/haptics";

const ICONS = {
  Duties: { on: "checkbox", off: "checkbox-outline" },
  Records: { on: "calendar", off: "calendar-outline" },
  Dashboard: { on: "grid", off: "grid-outline" },
  Roster: { on: "people", off: "people-outline" },
  Account: { on: "person-circle", off: "person-circle-outline" },
};

// Bar height only — the safe-area inset is added on top at render time and
// again in TAB_CONTENT_INSET, so scroll content always clears the real bar.
export const TAB_BAR_HEIGHT = 64;

export default function AppTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const barRef = useRef(null);
  const barMetricsRef = useRef({ left: 0, width: 0 });
  const [activeHoverIndex, setActiveHoverIndex] = useState(null);
  const dragHoverIndexRef = useRef(null);

  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  const hidden = focusedOptions?.tabBarStyle?.display === "none";

  const bottomInset = Math.max(insets.bottom, spacing.sm);
  const totalTabs = state.routes.length;

  const measureBar = () => {
    if (barRef.current && barRef.current.measureInWindow) {
      barRef.current.measureInWindow((x, _y, width, _height) => {
        if (width > 0) {
          barMetricsRef.current = { left: x, width };
        }
      });
    }
  };

  const calculateTargetIndex = (moveX) => {
    const { left, width } = barMetricsRef.current;
    if (width <= 0 || totalTabs <= 0) return state.index;

    const relativeX = Math.max(0, Math.min(moveX - left, width - 1));
    const index = Math.floor((relativeX / width) * totalTabs);
    return Math.max(0, Math.min(index, totalTabs - 1));
  };

  const handleIndexChange = (newIndex) => {
    if (newIndex !== dragHoverIndexRef.current) {
      dragHoverIndexRef.current = newIndex;
      setActiveHoverIndex(newIndex);
      haptics.select();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      // Do not capture on tap start so TouchableOpacity handles clicks cleanly
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Capture when user drags horizontally or vertically
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
      },
      onPanResponderGrant: (evt, gestureState) => {
        measureBar();
        const moveX = gestureState.moveX || evt.nativeEvent.pageX || 0;
        const initialIdx = calculateTargetIndex(moveX);
        dragHoverIndexRef.current = initialIdx;
        setActiveHoverIndex(initialIdx);
      },
      onPanResponderMove: (evt, gestureState) => {
        const moveX = gestureState.moveX || evt.nativeEvent.pageX || (gestureState.x0 + gestureState.dx);
        const targetIdx = calculateTargetIndex(moveX);
        handleIndexChange(targetIdx);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const moveX = gestureState.moveX || evt.nativeEvent.pageX || (gestureState.x0 + gestureState.dx);
        const finalIdx = dragHoverIndexRef.current ?? calculateTargetIndex(moveX);
        setActiveHoverIndex(null);
        dragHoverIndexRef.current = null;

        if (finalIdx >= 0 && finalIdx < totalTabs && finalIdx !== state.index) {
          const route = state.routes[finalIdx];
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!event.defaultPrevented) {
            haptics.select();
            navigation.navigate(route.name);
          }
        }
      },
      onPanResponderTerminate: () => {
        setActiveHoverIndex(null);
        dragHoverIndexRef.current = null;
      },
    })
  ).current;

  // Effective highlighted index: hover index if actively dragging, else state.index
  const currentHighlightIndex = activeHoverIndex !== null ? activeHoverIndex : state.index;

  if (hidden) return null;

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View
        ref={barRef}
        onLayout={(evt) => {
          const { width } = evt.nativeEvent.layout;
          barMetricsRef.current.width = width;
          measureBar();
        }}
        {...panResponder.panHandlers}
        style={styles.bar}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const focused = currentHighlightIndex === index;
          const icon = ICONS[route.name] || ICONS.Duties;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (state.index !== index && !event.defaultPrevented) {
              haptics.select();
              navigation.navigate(route.name);
            }
          };

          return (
            <TabButton
              key={route.key}
              label={label}
              icon={icon}
              focused={focused}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabButton({ label, icon, focused, onPress, onLongPress }) {
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: focused ? 1 : 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [focused, t]);

  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={styles.tab}
    >
      <Animated.View
        style={[
          styles.tabInner,
          {
            backgroundColor: t.interpolate({
              inputRange: [0, 1],
              outputRange: [TAB_BG_OFF, colors.primary],
            }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          },
        ]}
      >
        <Ionicons
          name={focused ? icon.on : icon.off}
          size={22}
          color={focused ? colors.onDark : colors.textMuted}
        />
        <Text
          style={[styles.label, focused ? styles.labelActive : styles.labelInactive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// The inactive end of the background interpolation. Fully transparent teal, so
// the colour ramp stays in the same hue instead of passing through grey.
const TAB_BG_OFF = "rgba(3, 83, 82, 0)";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    pointerEvents: "box-none",
  },
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    height: TAB_BAR_HEIGHT,
    marginHorizontal: layout.gutter,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: 28,
    backgroundColor: colors.bar,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderTopColor: colors.hairlineTop,
    borderBottomColor: colors.hairlineBottom,
    ...shadow.lg,
  },
  tab: { flex: 1 },
  tabInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
    borderRadius: 22,
  },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.1 },
  labelActive: { fontFamily: fonts.bold, color: colors.onDark },
  labelInactive: { fontFamily: fonts.medium, color: colors.textMuted },
});
