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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DutiesList" component={DutiesScreen} />
      <Stack.Screen name="DutyMarking" component={DutyMarkingScreen} />
    </Stack.Navigator>
  );
}

/**
 * Marking is a focused task with its own sticky footer, so the tab bar is
 * hidden there — it would otherwise sit on top of the Submit button.
 */
const hideTabBarOn = ["DutyMarking"];

function RoleTabs({ role, hasClass }) {
  const tabsByRole = {
    // "My Class" is the SRS A8 view — only meaningful for a class teacher,
    // so it's hidden from duty staff who have no class of their own.
    teacher: [
      { name: "Duties", component: DutiesStack },
      ...(hasClass ? [{ name: "My Class", component: ClassDayScreen }] : []),
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
      {user ? <RoleTabs role={user.role} hasClass={!!user.classKey} /> : <LoginScreen />}
    </NavigationContainer>
  );
}
