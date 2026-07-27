import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import DutiesScreen from "../screens/DutiesScreen";
import DutyMarkingScreen from "../screens/DutyMarkingScreen";
import DashboardScreen from "../screens/DashboardScreen";
import RosterScreen from "../screens/RosterScreen";
import AccountScreen from "../screens/AccountScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function DutiesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DutiesList" component={DutiesScreen} />
      <Stack.Screen name="DutyMarking" component={DutyMarkingScreen} />
    </Stack.Navigator>
  );
}

const TAB_ICONS = {
  Duties: "checkbox-outline",
  Dashboard: "grid-outline",
  Roster: "people-outline",
  Account: "person-circle-outline",
};

function RoleTabs({ role }) {
  // The gesture bar / soft keys vary by device, so the tab bar has to grow by
  // the real inset instead of a hard-coded height, or labels collide with it.
  const insets = useSafeAreaInsets();
  const tabsByRole = {
    teacher: [
      { name: "Duties", component: DutiesStack },
      { name: "Account", component: AccountScreen },
    ],
    coordinator: [
      { name: "Duties", component: DutiesStack },
      { name: "Roster", component: RosterScreen },
      { name: "Dashboard", component: DashboardScreen },
      { name: "Account", component: AccountScreen },
    ],
    management: [
      { name: "Dashboard", component: DashboardScreen },
      { name: "Account", component: AccountScreen },
    ],
    admin: [
      { name: "Dashboard", component: DashboardScreen },
      { name: "Roster", component: RosterScreen },
      { name: "Account", component: AccountScreen },
    ],
    nurse: [
      { name: "Dashboard", component: DashboardScreen },
      { name: "Account", component: AccountScreen },
    ],
  };
  const tabs = tabsByRole[role] || tabsByRole.teacher;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.semibold, marginTop: 2 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={22} color={color} />
        ),
      })}
    >
      {tabs.map((t) => (
        <Tab.Screen key={t.name} name={t.name} component={t.component} />
      ))}
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      {user ? <RoleTabs role={user.role} /> : <LoginScreen />}
    </NavigationContainer>
  );
}
