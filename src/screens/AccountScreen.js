import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts } from "../theme/theme";
import { ROLE_LABELS, DUTIES } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { records } = useAttendance();

  // Editable locally for now; wiring to Supabase is a backend task.
  const [phone, setPhone] = useState(user.phone || "");
  const [editing, setEditing] = useState(false);
  const [draftPhone, setDraftPhone] = useState(phone);

  const myDuties = DUTIES.filter((d) => d.staffId === user.id);
  const submitted = myDuties.filter((d) => records[d.id]).length;

  const savePhone = () => {
    setPhone(draftPhone.trim());
    setEditing(false);
  };

  const confirmLogout = () =>
    Alert.alert("Sign out", "You'll need your password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: logout },
    ]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Account</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.name || "?").charAt(0)}</Text>
          </View>
          <Text style={styles.profileName}>{user.name}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{ROLE_LABELS[user.role]}</Text>
          </View>
          {user.classLabel && <Text style={typography.caption}>{user.classLabel}</Text>}
        </View>

        {myDuties.length > 0 && (
          <View style={styles.statsRow}>
            <Stat value={myDuties.length} label="Duties today" />
            <View style={styles.statDivider} />
            <Stat value={submitted} label="Submitted" />
            <View style={styles.statDivider} />
            <Stat value={myDuties.length - submitted} label="Remaining" />
          </View>
        )}

        <Text style={styles.sectionLabel}>YOUR DETAILS</Text>
        <View style={styles.group}>
          <DetailRow icon="mail-outline" label="Email" value={user.email} locked />
          <Divider />
          <DetailRow
            icon="call-outline"
            label="Phone"
            value={phone || "Not set"}
            onEdit={() => {
              setDraftPhone(phone);
              setEditing(true);
            }}
          />
          <Divider />
          <DetailRow icon="shield-outline" label="Role" value={ROLE_LABELS[user.role]} locked />
        </View>
        <Text style={styles.note}>
          Name, email and role are managed by the school office. Ask an administrator to change
          them.
        </Text>

        <Text style={styles.sectionLabel}>SECURITY</Text>
        <View style={styles.group}>
          <ActionRow
            icon="key-outline"
            label="Change password"
            onPress={() =>
              Alert.alert("Change password", "A reset link will be sent to your email address.")
            }
          />
        </View>

        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.group}>
          <ActionRow
            icon="help-circle-outline"
            label="Help & contact office"
            onPress={() => Alert.alert("School office", "Contact the office for account help.")}
          />
          <Divider />
          <ActionRow
            icon="document-text-outline"
            label="About this app"
            onPress={() =>
              Alert.alert(
                "Gurukula Attendance",
                "Attendance & Student Safety\nPilot build\n\nBhaktivedanta Gurukula & International School"
              )
            }
          />
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Pilot build · v0.1</Text>
      </ScrollView>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>Phone number</Text>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            Used for duty reminders and escalations.
          </Text>
          <TextInput
            value={draftPhone}
            onChangeText={setDraftPhone}
            placeholder="+91 ..."
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoFocus
            style={styles.sheetInput}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={savePhone} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value, locked, onEdit }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {locked ? (
        <Ionicons name="lock-closed" size={13} color={colors.border} />
      ) : (
        <TouchableOpacity onPress={onEdit} hitSlop={10}>
          <Text style={styles.editLink}>Edit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ActionRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={[styles.rowValue, { flex: 1, marginLeft: spacing.sm }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 44 },
  pageTitle: { fontFamily: fonts.bold, fontSize: 28, color: colors.text, letterSpacing: -0.4 },

  profileCard: { alignItems: "center", paddingVertical: spacing.md, gap: 5 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
  profileName: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, marginTop: 4 },
  rolePill: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  rolePillText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.textMuted, letterSpacing: 0.3 },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  statLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  statDivider: { width: 1, height: 26, backgroundColor: colors.border },

  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    color: colors.textMuted,
    letterSpacing: 1.3,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 14 },
  rowLabel: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },
  rowValue: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.text },
  editLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 46 },
  note: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 8,
    lineHeight: 16,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerBg,
    backgroundColor: colors.dangerBg,
  },
  logoutText: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.danger },
  version: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetGrip: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.text },
  sheetInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
});
