import React from "react";
import { View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { colors } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import AppTabBar from "./AppTabBar";
import LoginScreen from "../screens/LoginScreen";
import DutiesScreen from "../screens/DutiesScreen";
import DutyMarkingScreen from "../screens/DutyMarkingScreen";
import DashboardScreen from "../screens/DashboardScreen";
import RosterScreen from "../screens/RosterScreen";
import AccountScreen from "../screens/AccountScreen";
import ClassDayScreen from "../screens/ClassDayScreen";
import ActivityScreen from "../screens/ActivityScreen";

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "transparent",
  },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function DutiesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Both screens sit on the same background image, so an opaque card
        // sliding over it showed a hard white edge mid-transition.
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="DutiesList" component={DutiesScreen} />
      <Stack.Screen name="DutyMarking" component={DutyMarkingScreen} />
    </Stack.Navigator>
  );
}

/**
 * The activity log hangs off Account rather than taking a tab of its own: it
 * is read occasionally, every role needs it, and the two roles with four tabs
 * already have no room for a fifth.
 */
function AccountStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="AccountHome" component={AccountScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
    </Stack.Navigator>
  );
}

/**
 * Marking is a focused task with its own sticky footer, so the tab bar is
 * hidden there — it would otherwise sit on top of the Submit button.
 */
const hideTabBarOn = ["DutyMarking"];

function RoleTabs({ role }) {
  const tabsByRole = {
    // "Records" reads any checkpoint's attendance back, for the whole group
    // that checkpoint covered. It was once class-scoped and hidden from duty
    // staff with no class of their own; it no longer looks at the reader's
    // class at all, so gating it on having one would hide a screen from the
    // people who most often need to check a past roll call.
    teacher: [
      { name: "Duties", component: DutiesStack },
      { name: "Records", component: ClassDayScreen },
      { name: "Account", component: AccountStack },
    ],
    coordinator: [
      { name: "Duties", component: DutiesStack },
      { name: "Roster", component: RosterScreen },
      { name: "Dashboard", component: DashboardScreen },
      { name: "Account", component: AccountStack },
    ],
    // The MOD is on the floor during meal and night checkpoints and is one of
    // the people expected to step in when a duty teacher is missing, so they
    // need the marking screen — not just a dashboard telling them it is late.
    management: [
      { name: "Dashboard", component: DashboardScreen },
      { name: "Duties", component: DutiesStack },
      { name: "Roster", component: RosterScreen },
      { name: "Account", component: AccountStack },
    ],
    admin: [
      { name: "Dashboard", component: DashboardScreen },
      { name: "Duties", component: DutiesStack },
      { name: "Roster", component: RosterScreen },
      { name: "Account", component: AccountStack },
    ],
    nurse: [
      { name: "Dashboard", component: DashboardScreen },
      { name: "Account", component: AccountStack },
    ],
  };
  const tabs = tabsByRole[role] || tabsByRole.teacher;

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      {tabs.map((t) => (
        <Tab.Screen
          key={t.name}
          name={t.name}
          component={t.component}
          options={({ route }) => {
            const child = getFocusedRouteNameFromRoute(route);
            return child && hideTabBarOn.includes(child)
              ? { tabBarStyle: { display: "none" }, tabBarVisible: false }
              : {};
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, restoring } = useAuth();

  // Blank while a stored session is being checked — brief, and avoids showing
  // the login screen to someone who is already signed in.
  if (restoring) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? <RoleTabs role={user.role} /> : <LoginScreen />}
    </NavigationContainer>
  );
}
