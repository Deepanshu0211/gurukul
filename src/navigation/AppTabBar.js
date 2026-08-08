import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/theme";
import { haptics } from "../lib/haptics";

/**
 * Bottom tab bar.
 *
 * Attached to the bottom rather than floating: navigation should be the
 * quietest thing on screen, and a floating slab in an otherwise white, airy
 * app becomes the heaviest object on it.
 *
 * The active tab is marked by a soft circular tint behind its icon plus a
 * darker, heavier label — no hard block of colour. A circle rather than a
 * wide rounded rectangle so each tab is symmetrical about its own centre.
 *
 * Labels are always visible: staff use this before dawn and include people
 * who are not phone-confident, so unlabelled icons are a real cost for them.
 */

const ICONS = {
  Duties: { on: "checkbox", off: "checkbox-outline" },
  "My Class": { on: "school", off: "school-outline" },
  Dashboard: { on: "grid", off: "grid-outline" },
  Roster: { on: "people", off: "people-outline" },
  Account: { on: "person-circle", off: "person-circle-outline" },
};

// Used only to work out how much bottom padding screens need. The bar itself
// is NOT given a fixed height — it sizes to its content plus the device
// inset, so a label can never be clipped by a short container.
export const TAB_BAR_HEIGHT = 74;

export default function AppTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  // A custom tab bar must honour `tabBarStyle: { display: 'none' }` itself —
  // React Navigation only applies that to its built-in bar.
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if (focusedOptions?.tabBarStyle?.display === "none") return null;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
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
            // Only on an actual change — re-tapping the current tab should
            // not buzz, or the feedback stops meaning "you moved".
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
            style={styles.tab}
          >
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={focused ? icon.on : icon.off}
                size={20}
                color={focused ? colors.text : colors.textMuted}
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
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
    // No fixed height — the row grows to fit its content, then the device
    // inset is added on top so it always clears the gesture bar or soft keys.
  },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  // A circle, and the same size whether active or not — so each tab is
  // symmetrical about its centre and the row never shifts on tap.
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: colors.cardAlt },
  // Explicit lineHeight: without it the text box is font-dependent and can be
  // taller than it looks, which is how labels end up visually clipped.
  label: { fontSize: 10.5, lineHeight: 14, letterSpacing: 0.15 },
  labelActive: { fontFamily: fonts.bold, color: colors.text },
  labelInactive: { fontFamily: fonts.medium, color: colors.textMuted },
});
