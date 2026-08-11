import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/theme";
import { haptics } from "../lib/haptics";
import { GlassView } from "../components/GlassView";

const ICONS = {
  Duties: { on: "checkbox", off: "checkbox-outline" },
  "My Class": { on: "school", off: "school-outline" },
  Dashboard: { on: "grid", off: "grid-outline" },
  Roster: { on: "people", off: "people-outline" },
  Account: { on: "person-circle", off: "person-circle-outline" },
};

export const TAB_BAR_HEIGHT = 80;

export default function AppTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if (focusedOptions?.tabBarStyle?.display === "none") return null;

  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <GlassView cornerRadius={32} style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const focused = state.index === index;
          const icon = ICONS[route.name] || ICONS.Duties;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptics.select();
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              activeOpacity={0.7}
              style={[styles.tab, focused && styles.tabActive]}
            >
              {focused && <View style={styles.activeTopLine} />}
              <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                <Ionicons
                  name={focused ? icon.on : icon.off}
                  size={21}
                  color={focused ? colors.primary : colors.textMuted}
                />
              </View>
              <Text
                style={[styles.label, focused ? styles.labelActive : styles.labelInactive]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    marginHorizontal: 16,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    borderTopColor: "rgba(255, 255, 255, 0.95)",
    borderBottomColor: "rgba(255, 255, 255, 0.45)",
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.20,
    shadowRadius: 22,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 22,
    position: "relative",
  },
  tabActive: {
    backgroundColor: "rgba(28, 78, 128, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.65)",
  },
  activeTopLine: {
    position: "absolute",
    top: 2,
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    transform: [{ scale: 1.05 }],
  },
  label: {
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.15,
    marginTop: 1,
  },
  labelActive: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  labelInactive: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
});
