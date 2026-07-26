import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../theme/theme";
import { STAFF, ROLE_LABELS } from "../data/mockData";
import { Card, PrimaryButton } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const ROLES = Object.keys(ROLE_LABELS);

export default function LoginScreen() {
  const { login } = useAuth();
  const [role, setRole] = useState("teacher");
  const [selectedId, setSelectedId] = useState(STAFF.find((s) => s.role === "teacher").id);

  const staffForRole = STAFF.filter((s) => s.role === role);
  const selected = staffForRole.find((s) => s.id === selectedId) || staffForRole[0];

  const handleRole = (r) => {
    setRole(r);
    const first = STAFF.find((s) => s.role === r);
    setSelectedId(first.id);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Ionicons name="school-outline" size={30} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>Gurukula</Text>
          <Text style={styles.heroSubtitle}>Attendance & Student Safety</Text>
        </View>

        <View style={styles.body}>
          <Text style={typography.label}>SIGN IN AS</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const active = r === role;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => handleRole(r)}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{ROLE_LABELS[r]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[typography.label, { marginTop: spacing.lg }]}>ACCOUNT</Text>
          <View style={{ marginTop: spacing.sm, gap: 10 }}>
            {staffForRole.map((s) => {
              const active = s.id === selectedId;
              return (
                <TouchableOpacity key={s.id} onPress={() => setSelectedId(s.id)} activeOpacity={0.8}>
                  <Card style={[styles.staffCard, active && styles.staffCardActive]}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{s.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={typography.h3}>{s.name}</Text>
                      <Text style={typography.caption}>{s.email}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>

          <PrimaryButton title="Continue" onPress={() => login(selected)} style={{ marginTop: spacing.xl }} />
          <Text style={styles.footNote}>Prototype build · pilot data only</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + 12,
    alignItems: "center",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroTitle: { color: colors.white, fontSize: 24, fontWeight: "700" },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },
  body: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  roleChipText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  roleChipTextActive: { color: colors.white },
  staffCard: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "transparent" },
  staffCardActive: { borderColor: colors.primary },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECE9FD",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  footNote: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: spacing.md },
});
