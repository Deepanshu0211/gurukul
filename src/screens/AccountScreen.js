import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius } from "../theme/theme";
import { Card, IconCircle } from "../components/ui";
import { ROLE_LABELS } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

const OPTIONS = [
  { key: "prefs", label: "View\npreference", icon: "person-outline", bg: "#ECE9FD", fg: colors.primary },
  { key: "download", label: "Download\noptions", icon: "download-outline", bg: "#E3F6F1", fg: "#1BB7A0" },
  { key: "playback", label: "Playback\noptions", icon: "play-circle-outline", bg: "#FCE9F3", fg: "#E066A6" },
  { key: "general", label: "General\noption", icon: "settings-outline", bg: "#ECE9FD", fg: colors.primary },
];

export default function AccountScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 }}>
        <Text style={typography.h1}>Account</Text>

        <Card style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
          </View>
          <View style={{ marginLeft: spacing.md }}>
            <Text style={typography.h3}>{user.name}</Text>
            <Text style={typography.caption}>{user.email}</Text>
          </View>
        </Card>

        <View style={styles.grid}>
          {OPTIONS.map((o) => (
            <TouchableOpacity key={o.key} style={styles.gridItem} activeOpacity={0.8}>
              <Card style={styles.gridCard}>
                <IconCircle bg={o.bg} size={48}>
                  <Ionicons name={o.icon} size={22} color={o.fg} />
                </IconCircle>
                <Text style={styles.gridLabel}>{o.label}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <Card style={styles.listRow}>
          <IconCircle size={36}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
          </IconCircle>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={typography.body}>Role</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontWeight: "600" }}>{ROLE_LABELS[user.role]}</Text>
        </Card>

        <Card style={[styles.listRow, { marginTop: 10 }]}>
          <IconCircle size={36}>
            <Ionicons name="help-circle-outline" size={18} color={colors.text} />
          </IconCircle>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={typography.body}>Help and Support</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </Card>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => Alert.alert("Log out", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Log out", style: "destructive", onPress: logout },
          ])}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECE9FD",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, fontWeight: "700", fontSize: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: spacing.lg },
  gridItem: { width: "48%" },
  gridCard: { alignItems: "flex-start" },
  gridLabel: { marginTop: spacing.sm, fontSize: 15, fontWeight: "700", color: colors.text, lineHeight: 20 },
  listRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg },
  logoutBtn: {
    marginTop: spacing.lg,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerBg,
    backgroundColor: colors.dangerBg,
  },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
