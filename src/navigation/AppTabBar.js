import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, PanResponder } from "react-native";
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
  Gate: { on: "exit", off: "exit-outline" },
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

  // ONE highlight pill that slides between tabs, rather than each tab fading
  // its own background. Driven by transform on the native thread, so it stays
  // smooth while the next screen is mounting on the JS thread.
  const [rowWidth, setRowWidth] = useState(0);
  const tabWidth = totalTabs > 0 ? rowWidth / totalTabs : 0;
  const pillX = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!tabWidth) return;
    const to = currentHighlightIndex * tabWidth;
    // First layout: put it in place without a slide from the left edge.
    if (!placed.current) {
      pillX.setValue(to);
      placed.current = true;
      return;
    }
    Animated.spring(pillX, {
      toValue: to,
      useNativeDriver: true,
      // Quick and settled: arrives in ~250ms with the faintest overshoot.
      stiffness: 420,
      damping: 34,
      mass: 0.9,
    }).start();
  }, [currentHighlightIndex, tabWidth, pillX]);

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
        <View
          style={styles.row}
          onLayout={(evt) => setRowWidth(evt.nativeEvent.layout.width)}
        >
          {tabWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.pill, { width: tabWidth, transform: [{ translateX: pillX }] }]}
            />
          )}
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
    </View>
  );
}

function TabButton({ label, icon, focused, onPress, onLongPress }) {
  // Press feedback: a small native-driven squash and spring back, instead of
  // the opacity flash, which read as the whole bar flickering.
  const press = useRef(new Animated.Value(1)).current;
  const springTo = (v) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, stiffness: 600, damping: 30 }).start();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => springTo(0.92)}
      onPressOut={() => springTo(1)}
      style={styles.tab}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: press }] }]}>
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
    </Pressable>
  );
}

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
  // The tabs and the sliding pill share this row, so the pill's x and width
  // are measured against exactly the space the tabs divide between them.
  row: { flex: 1, flexDirection: "row" },
  pill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 22,
    backgroundColor: colors.primary,
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
