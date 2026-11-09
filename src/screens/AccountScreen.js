import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, radius, fonts, layout, surface } from "../theme/theme";
import { useTabContentInset, useScreenTopInset } from "../navigation/tabBarInset";
import ScreenHeader from "../components/ScreenHeader";
import EdgeFade, { useScrolled } from "../components/EdgeFade";
import BottomSheet, { SheetOption } from "../components/BottomSheet";
import { SectionLabel, Divider, Stat, TextAction, PrimaryButton, Chevron } from "../components/ui";
import { plural } from "../utils/format";
import { useMarkingTotals } from "../lib/history";
import {
  canDeclareHoliday,
  canWorkGate,
  canManageRoster,
  canAddStudent,
  roleLabel,
  ROLES,
} from "../domain/roles";
import AddStudentSheet from "../components/AddStudentSheet";
import { changeOwnPassword, passwordProblem } from "../lib/passwords";
import appConfig from "../../app.json";
import { describeError } from "../lib/errors";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { useNotifications } from "../context/NotificationsContext";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import Avatar from "../components/Avatar";
import { pickImage, uploadAvatar, removeAvatar } from "../lib/avatars";
import { updateOwnPhone } from "../lib/staff";
import { haptics, isHapticsEnabled, setHapticsEnabled } from "../lib/haptics";
import {
  areRemindersEnabled,
  loadReminderPreference,
  cancelAllReminders,
  ensureReminderPermission,
  remindersSupported,
  remindersUnavailableReason,
  setRemindersEnabled,
  syncDutyReminders,
} from "../lib/reminders";

/**
 * Keyed by `remindersUnavailableReason()`, so a build that cannot schedule
 * anything says which build can. The row used to read "a browser cannot
 * schedule notifications" on an Android phone running Expo Go, which is both
 * wrong and no help to the person holding it.
 */
const REMINDER_HINT = {
  null: "A notification 10 minutes before each checkpoint you are down to mark, and again 10 minutes before it closes if it is still unmarked. Only your own checkpoints, and only on this phone.",
  web: "Available in the phone app. A browser cannot schedule notifications.",
  "expo-go":
    "Not available in Expo Go — it has no notification support on Android. Install the development build of this app to use reminders.",
};

const ICON = 18;

/** Which database this build talks to, from the project ref in its URL. */
const SERVER = (() => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  if (url.includes("ofuvjzxjbgsityacukva")) return "Mock (test data)";
  if (url.includes("qpwfmdddvpmnqlwqrzke")) return "Pilot (school data)";
  return url ? "Custom server" : "Not configured";
})();
const VERSION = appConfig?.expo?.version || "—";

/** The short "how do I…" guide, per role. Kept to what the app actually does. */
const GUIDE = {
  marking: [
    ["checkmark-done-outline", "Everyone starts Present", "Open a duty and tap only the children who are not there. Present is the default."],
    ["swap-horizontal-outline", "Absent vs accounted", "Absent means nobody knows where the child is — it raises a safety alert. Home, Sick, Outing and Activity are accounted for."],
    ["lock-closed-outline", "Submitting locks it", "After you submit, the register is read-only for you. A coordinator or the MOD can correct it."],
    ["notifications-outline", "Reminders", "Turn on Duty reminders above to be nudged 10 minutes before each of your checkpoints closes."],
  ],
  desk: [
    ["options-outline", "Checkpoints & groups", "Account → Checkpoints & groups. Add a checkpoint, then add the groups it covers: a class, a band, a house, or a hand-picked list."],
    ["person-add-outline", "New staff", "Requests appear on the Dashboard. You can also add a teacher directly from Roster → Staff → + Add."],
    ["key-outline", "Forgotten passwords", "Roster → Staff → tap the person → Reset password. Give them the code yourself; they choose the new password."],
    ["person-remove-outline", "Someone leaves", "Roster → Staff → Deactivate. Pick who takes their duties; their history is kept."],
  ],
};
// Row text starts after the padding, the icon and the gap. Dividers use the
// same number so the hairline begins exactly under the label above it.
const ROW_INSET = spacing.md + ICON + spacing.sm;

export default function AccountScreen({ navigation }) {
  const { user, logout, updateUser } = useAuth();
  const notices = useNotifications();
  const { duties, records, staff } = useSchoolData();
  const dialog = useDialog();
  const toast = useToast();
  const tabInset = useTabContentInset();
  const topInset = useScreenTopInset();
  const { scrolled, onScroll } = useScrolled();

  const [editing, setEditing] = useState(false);
  const [draftPhone, setDraftPhone] = useState(user.phone || "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabled());
  // Change password (signed in) and the Support sheets.
  const [pwSheet, setPwSheet] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [supportSheet, setSupportSheet] = useState(null); // "contact" | "guide" | "about"
  // Teachers have no Roster tab, so this is their way to add a new child.
  const [addingStudent, setAddingStudent] = useState(false);

  const pwIssue = pw.current ? passwordProblem(pw.next, pw.confirm) : "Enter your current password";

  const savePassword = async () => {
    if (pwIssue || pwBusy) return;
    setPwBusy(true);
    setPwError(null);
    try {
      await changeOwnPassword(user.email, pw.current, pw.next);
      haptics.success();
      setPwSheet(false);
      setPw({ current: "", next: "", confirm: "" });
      toast.show("Password changed · use it next time you sign in");
    } catch (e) {
      const shown = describeError(e, { title: "Not changed", message: "Your password was not changed. Try again." });
      setPwError(shown.message);
    } finally {
      setPwBusy(false);
    }
  };

  // Who to ask: coordinators first, then the administrator. From the live
  // staff directory, so a new coordinator is listed without an app update.
  const helpdesk = (staff || [])
    .filter((m) => m.role === ROLES.COORDINATOR || m.role === ROLES.ADMIN)
    .filter((m) => m.id !== user.id)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === ROLES.COORDINATOR ? -1 : 1));

  const open = (url) =>
    Linking.openURL(url).catch(() =>
      dialog.alert({ icon: "alert-circle-outline", title: "Can't open that here", message: url.replace(/^(tel|mailto):/, "") })
    );

  const reportProblem = () => {
    const to = helpdesk.find((m) => m.email)?.email || "";
    const subject = encodeURIComponent("BG-SAAR · problem report");
    const body = encodeURIComponent(
      `What happened:\n\n\nWhat I expected:\n\n\n— \nApp ${VERSION} · ${Platform.OS} · ${SERVER}\n${user.name} (${roleLabel(user.role)})`
    );
    open(`mailto:${to}?subject=${subject}&body=${body}`);
  };

  const toggleHaptics = (value) => {
    setHapticsOn(value);
    setHapticsEnabled(value);
    // Fire once when switching on, so the setting demonstrates itself.
    if (value) haptics.select();
  };

  // The cached value is right once something has read storage, and this screen
  // can be the first thing rendered after a cold start. Without the effect, a
  // teacher who turned reminders off sees the switch back on.
  const [remindersOn, setRemindersOn] = useState(areRemindersEnabled());
  const [remindersBusy, setRemindersBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadReminderPreference().then((saved) => {
      if (!cancelled) setRemindersOn(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Switching reminders on is the one place the app asks for the notification
   * permission with the user's intent already on the screen.
   *
   * The switch is put back if the operating system refuses. A toggle left
   * sitting on "on" over a permission that was declined is the worst outcome
   * available here: the teacher believes they will be reminded at 4:20 AM, and
   * nothing will happen.
   */
  const toggleReminders = async (value) => {
    setRemindersOn(value);
    setRemindersBusy(true);
    try {
      await setRemindersEnabled(value);

      if (!value) {
        await cancelAllReminders();
        toast.show("Reminders switched off");
        return;
      }

      const permission = await ensureReminderPermission({ ask: true });
      if (permission !== "granted") {
        setRemindersOn(false);
        await setRemindersEnabled(false);
        dialog.alert({
          icon: "notifications-off-outline",
          title:
            permission === "unsupported" ? "Reminders are not available here" : "Notifications are blocked",
          message:
            permission === "unsupported"
              ? REMINDER_HINT[remindersUnavailableReason()]
              : "Android is holding the permission for this app. Open Settings → Apps → BG-SAAR → Notifications and allow them, then switch this back on.",
        });
        return;
      }

      const { checkpoints } = await syncDutyReminders(user);
      toast.show(
        checkpoints
          ? `Reminders set for your next ${plural(checkpoints, "checkpoint")}`
          : "Reminders on. Nothing left for you to mark."
      );
    } catch (e) {
      setRemindersOn(false);
      const shown = describeError(
        e,
        {
          title: "Could not set reminders",
          message: "Nothing has been scheduled. Try again.",
        },
        null
      );
      toast.show(shown.message, { tone: "danger" });
    } finally {
      setRemindersBusy(false);
    }
  };

  const phone = user.phone || "";
  const myDuties = duties.filter((d) => d.staffId === user.id);
  const submitted = myDuties.filter((d) => records[d.id]).length;
  // Moved here from the Records screen, where it sat under a class heading
  // and a date and was read as belonging to them. Beside your own name and
  // photograph, "you, all time" needs no explaining.
  //
  // Cover submissions and corrections also change your personal totals,
  // even when none of the duties were originally assigned to you.
  const totals = useMarkingTotals(user?.id, records);

  const savePhone = async () => {
    const next = draftPhone.trim();
    setSavingPhone(true);
    try {
      const updated = await updateOwnPhone(user.id, next);
      updateUser({ phone: updated?.phone ?? next });
      setEditing(false);
      toast.show(next ? "Phone number saved" : "Phone number cleared");
    } catch (e) {
      const shown = describeError(
        e,
        { title: "Could not save", message: "Your phone number wasn't updated. Try again." },
        null
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.offline ? shown.title : "Could not save",
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setSavingPhone(false);
    }
  };

  const changePhoto = async (source) => {
    setPhotoSheet(false);
    try {
      const uri = await pickImage(source);
      if (!uri) return; // user backed out
      setPhotoBusy(true);
      const url = await uploadAvatar(uri, user.id);
      updateUser({ photoUrl: url });
      toast.show("Profile photo updated");
    } catch (e) {
      const shown = describeError(
        e,
        { title: "Photo not updated", message: "Something went wrong uploading your photo." },
        null
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.offline ? shown.title : "Photo not updated",
        message: shown.message,
        destructive: !shown.offline,
      });
    } finally {
      setPhotoBusy(false);
    }
  };

  const confirmRemovePhoto = () => {
    setPhotoSheet(false);
    dialog.confirm({
      icon: "trash-outline",
      title: "Remove photo?",
      message: "Your initial will be shown instead.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        setPhotoBusy(true);
        try {
          await removeAvatar(user.id);
          updateUser({ photoUrl: null });
          toast.show("Profile photo removed");
        } catch (e) {
          const shown = describeError(
        e,
        { title: "Could not remove", message: "Your photo wasn't removed. Try again." },
        null
      );
      dialog.alert({
        icon: shown.offline ? "cloud-offline-outline" : "alert-circle-outline",
        title: shown.offline ? shown.title : "Could not remove",
        message: shown.message,
        destructive: !shown.offline,
      });
        } finally {
          setPhotoBusy(false);
        }
      },
    });
  };

  const confirmLogout = () =>
    dialog.confirm({
      icon: "log-out-outline",
      title: "Sign out?",
      message: "You'll need your email and password to sign back in.",
      confirmLabel: "Sign out",
      destructive: true,
      onConfirm: logout,
    });

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabInset }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <ScreenHeader title="Account" />

        <View style={styles.profileCard}>
          <TouchableOpacity
            onPress={() => setPhotoSheet(true)}
            disabled={photoBusy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            <Avatar name={user.name} src={user.photoUrl} size={84} bordered />
            <View style={styles.cameraBadge}>
              {photoBusy ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="camera" size={14} color={colors.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName} numberOfLines={1}>
            {user.name}
          </Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{roleLabel(user.role)}</Text>
          </View>
          {!!user.classLabel && <Text style={typography.caption}>{user.classLabel}</Text>}
        </View>

        {myDuties.length > 0 && (
          <View style={styles.statsRow}>
            <Stat value={myDuties.length} label="Duties today" inverted />
            <View style={styles.statDivider} />
            <Stat value={submitted} label="Submitted" inverted />
            <View style={styles.statDivider} />
            <Stat value={myDuties.length - submitted} label="Remaining" inverted />
          </View>
        )}

        <SectionLabel>Your record</SectionLabel>
        <View style={styles.statsRow}>
          <Stat value={totals.loading || totals.error ? "—" : totals.taken} label="Checkpoints taken" inverted />
          <View style={styles.statDivider} />
          <Stat value={totals.loading || totals.error ? "—" : totals.marked} label="Students marked" inverted />
          <View style={styles.statDivider} />
          <Stat value={totals.loading || totals.error ? "—" : totals.absent} label="Absences found" inverted />
        </View>

        <SectionLabel>Your details</SectionLabel>
        <View style={styles.group}>
          <DetailRow icon="mail-outline" label="Email" value={user.email} locked />
          <Divider inset={ROW_INSET} />
          <DetailRow
            icon="call-outline"
            label="Phone"
            value={phone || "Not set"}
            onEdit={() => {
              setDraftPhone(phone);
              setEditing(true);
            }}
          />
          <Divider inset={ROW_INSET} />
          <DetailRow icon="shield-outline" label="Role" value={roleLabel(user.role)} locked />
        </View>
        <Text style={styles.note}>
          Name, email and role are managed by the school office. Ask an administrator to change
          them.
        </Text>

        <SectionLabel>Reminders</SectionLabel>
        <View style={styles.group}>
          <View style={styles.row}>
            <Ionicons name="alarm-outline" size={ICON} color={colors.textMuted} />
            <View style={styles.rowMain}>
              <Text style={styles.rowValue}>Remind me before a checkpoint</Text>
              <Text style={styles.rowHint}>{REMINDER_HINT[remindersUnavailableReason()]}</Text>
            </View>
            <Switch
              // Forced off in a browser rather than shown on-but-disabled: a
              // switch sitting in the "on" position over a line saying nothing
              // can be scheduled is a promise the page cannot keep.
              value={remindersOn && remindersSupported()}
              onValueChange={toggleReminders}
              disabled={remindersBusy || !remindersSupported()}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
              accessibilityLabel="Remind me before a checkpoint"
            />
          </View>
        </View>

        {/* <SectionLabel>Preferences</SectionLabel> */}
        {/* <View style={styles.group}>
          <View style={styles.row}>
            <Ionicons name="phone-portrait-outline" size={ICON} color={colors.textMuted} />
            <View style={styles.rowMain}>
              <Text style={styles.rowValue}>Vibration feedback</Text>
              <Text style={styles.rowHint}>
                A short buzz when you mark a student absent or submit. Turn off for night and
                early-morning checkpoints in the dormitories.
              </Text>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={toggleHaptics}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
              accessibilityLabel="Vibration feedback"
            />
          </View>
        </View> */}

        {/* The school's calendar and its gate register. Both hang off Account
            rather than taking a tab, for the same reason the activity log
            does: they are opened occasionally by two roles, and the roles
            that need them already have four tabs with no room for a fifth.
            Reception is the exception — the gate IS their job, so they get it
            as a tab in RootNavigator. */}
        {(canDeclareHoliday(user?.role) || canWorkGate(user?.role) || canAddStudent(user?.role)) && (
          <>
            <SectionLabel>School</SectionLabel>
            <View style={styles.group}>
              {canAddStudent(user?.role) && (
                <>
                  <ActionRow
                    icon="person-add-outline"
                    label="Add a student"
                    onPress={() => setAddingStudent(true)}
                  />
                  {(canManageRoster(user?.role) || canDeclareHoliday(user?.role) || canWorkGate(user?.role)) && (
                    <Divider inset={ROW_INSET} />
                  )}
                </>
              )}
              {canManageRoster(user?.role) && (
                <>
                  <ActionRow
                    icon="options-outline"
                    label="Checkpoints & groups"
                    onPress={() => navigation.navigate("Checkpoints")}
                  />
                  <Divider inset={ROW_INSET} />
                </>
              )}
              {canDeclareHoliday(user?.role) && (
                <ActionRow
                  icon="calendar-outline"
                  label="Holidays"
                  onPress={() => navigation.navigate("Holidays")}
                />
              )}
              {canWorkGate(user?.role) && (
                <ActionRow
                  icon="exit-outline"
                  label="Gate — sign students in and out"
                  onPress={() => navigation.navigate("Gate")}
                />
              )}
            </View>
          </>
        )}

        <SectionLabel>Records</SectionLabel>
        <View style={styles.group}>
          {notices.enabled && (
            <>
              <ActionRow
                icon="notifications-outline"
                label="Notifications — gate sign-outs & sign-ins"
                badge={notices.unread}
                onPress={() => navigation.navigate("Notifications")}
              />
              <Divider inset={ROW_INSET} />
            </>
          )}
          <ActionRow
            icon="receipt-outline"
            label="Activity log"
            onPress={() => navigation.navigate("Activity")}
          />
        </View>

        <SectionLabel>Security</SectionLabel>
        <View style={styles.group}>
          <ActionRow
            icon="key-outline"
            label="Change password"
            onPress={() => {
              setPw({ current: "", next: "", confirm: "" });
              setPwError(null);
              setPwSheet(true);
            }}
          />
        </View>

        <SectionLabel>Support</SectionLabel>
        <View style={styles.group}>
          <ActionRow
            icon="chatbubbles-outline"
            label="Contact a coordinator"
            onPress={() => setSupportSheet("contact")}
          />
          <Divider inset={ROW_INSET} />
          <ActionRow icon="book-outline" label="Quick guide" onPress={() => setSupportSheet("guide")} />
          <Divider inset={ROW_INSET} />
          <ActionRow icon="bug-outline" label="Report a problem" onPress={reportProblem} />
          <Divider inset={ROW_INSET} />
          <ActionRow
            icon="information-circle-outline"
            label="About this app"
            onPress={() => setSupportSheet("about")}
          />
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={confirmLogout}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>

       
      </ScrollView>

      <EdgeFade top={0} height={topInset} visible={scrolled} />

      <BottomSheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Phone number"
        subtitle="Used for duty reminders and escalations."
        scroll={false}
      >
        <TextInput
          value={draftPhone}
          onChangeText={setDraftPhone}
          placeholder="+91 ..."
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          style={styles.sheetInput}
          accessibilityLabel="Phone number"
        />
        <PrimaryButton
          title={savingPhone ? "Saving…" : "Save"}
          onPress={savePhone}
          disabled={savingPhone}
          style={{ marginTop: spacing.md }}
        />
      </BottomSheet>

      <BottomSheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Profile photo"
        subtitle="Shown to coordinators and on your marked records."
      >
        <SheetOption
          icon="camera-outline"
          label="Take a photo"
          onPress={() => changePhoto("camera")}
        />
        <SheetOption
          icon="images-outline"
          label="Choose from gallery"
          onPress={() => changePhoto("library")}
        />
        {!!user.photoUrl && (
          <SheetOption
            icon="trash-outline"
            label="Remove photo"
            danger
            onPress={confirmRemovePhoto}
          />
        )}
      </BottomSheet>

      <AddStudentSheet visible={addingStudent} onClose={() => setAddingStudent(false)} />

      <BottomSheet
        visible={pwSheet}
        onClose={() => !pwBusy && setPwSheet(false)}
        title="Change password"
        subtitle="At least 8 characters. You stay signed in on this phone."
        showClose
      >
        {[
          ["current", "Current password", "password"],
          ["next", "New password", "newPassword"],
          ["confirm", "New password again", "newPassword"],
        ].map(([key, label, content]) => (
          <TextInput
            key={key}
            value={pw[key]}
            onChangeText={(v) => setPw((p) => ({ ...p, [key]: v }))}
            placeholder={label}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={content}
            style={[styles.sheetInput, { marginBottom: spacing.sm }]}
            accessibilityLabel={label}
          />
        ))}
        {!!(pwError || (pw.next && pwIssue)) && (
          <Text style={styles.pwError}>{pwError || pwIssue}</Text>
        )}
        <PrimaryButton
          title={pwBusy ? "Saving…" : "Change password"}
          icon="key-outline"
          onPress={savePassword}
          disabled={!!pwIssue || pwBusy}
          style={{ marginTop: spacing.sm }}
        />
        <Text style={styles.note}>
          Forgotten it instead? Sign out, tap “Forgot password?” and ask a coordinator for a reset code.
        </Text>
      </BottomSheet>

      <BottomSheet
        visible={supportSheet === "contact"}
        onClose={() => setSupportSheet(null)}
        title="Contact a coordinator"
        subtitle="For your account, your duties, or a child you cannot find."
        showClose
      >
        {helpdesk.length ? (
          helpdesk.map((m) => (
            <View key={m.id} style={styles.contactRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.h3} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {roleLabel(m.role)}
                  {m.phone ? ` · ${m.phone}` : ""}
                </Text>
              </View>
              {!!m.phone && (
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => open(`tel:${m.phone.replace(/\s/g, "")}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${m.name}`}
                >
                  <Ionicons name="call" size={16} color={colors.onDark} />
                </TouchableOpacity>
              )}
              {!!m.email && (
                <TouchableOpacity
                  style={[styles.contactBtn, styles.contactBtnSoft]}
                  onPress={() => open(`mailto:${m.email}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Email ${m.name}`}
                >
                  <Ionicons name="mail" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <Text style={typography.caption}>Contact the school office for help with your account.</Text>
        )}
        <Text style={styles.note}>
          A child missing right now? Do not wait for the app — call the MOD or the coordinator on duty.
        </Text>
      </BottomSheet>

      <BottomSheet
        visible={supportSheet === "guide"}
        onClose={() => setSupportSheet(null)}
        title="Quick guide"
        subtitle={`For ${roleLabel(user.role).toLowerCase()}s`}
        showClose
      >
        {[...GUIDE.marking, ...(canManageRoster(user.role) ? GUIDE.desk : [])].map(([icon, title, body]) => (
          <View key={title} style={styles.guideRow}>
            <View style={styles.guideIcon}>
              <Ionicons name={icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={typography.h3}>{title}</Text>
              <Text style={typography.caption}>{body}</Text>
            </View>
          </View>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={supportSheet === "about"}
        onClose={() => setSupportSheet(null)}
        title="BG-SAAR"
        subtitle="Attendance & Student Safety · Bhaktivedanta Gurukula & International School"
        showClose
      >
        <SheetOption icon="pricetag-outline" label={`Version ${VERSION}`} hint={`${Platform.OS} build`} />
        <SheetOption icon="server-outline" label={SERVER} hint="The database this build reads and writes" />
        <SheetOption icon="person-outline" label={user.email} hint={roleLabel(user.role)} />
      </BottomSheet>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value, locked, onEdit }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={ICON} color={colors.textMuted} />
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {locked ? (
        <Ionicons
          name="lock-closed"
          size={14}
          color={colors.icon}
          accessibilityLabel="Managed by the school office"
        />
      ) : (
        <TextAction label="Edit" accessibilityLabel={`Edit ${label}`} onPress={onEdit} />
      )}
    </View>
  );
}

function ActionRow({ icon, label, onPress, badge }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
    >
      <Ionicons name={icon} size={ICON} color={colors.textMuted} />
      <View style={styles.rowMain}>
        <Text style={styles.rowValue}>{label}</Text>
      </View>
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      )}
      <Chevron />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: colors.white },
  content: { paddingHorizontal: layout.gutter },

  profileCard: { alignItems: "center", paddingVertical: spacing.md, gap: spacing.xs + 2 },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    // A solid ring, so the badge separates from the photo behind it. This was
    // `colors.bg`, which is transparent — the ring never rendered.
    borderWidth: 2.5,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { ...typography.h1, marginTop: spacing.xs },
  rolePill: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: 4,
  },
  rolePillText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },

  statsRow: {
    ...surface.inverse,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    marginTop: spacing.sm,
  },
  statDivider: { width: StyleSheet.hairlineWidth * 2, height: 36, backgroundColor: "rgba(255, 255, 255, 0.2)" },

  group: {
    ...surface.card,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.row,
    paddingVertical: spacing.md - 4,
    paddingHorizontal: spacing.md,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 1 },
  rowLabel: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  rowValue: { ...typography.body, fontFamily: fonts.medium },
  rowHint: { ...typography.caption, fontSize: 11, lineHeight: 15, marginTop: 2 },
  note: { ...typography.caption, fontSize: 11, lineHeight: 15, marginTop: spacing.sm },

  pwError: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touch + 8,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.divider,
  },
  contactBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  contactBtnSoft: { backgroundColor: colors.primarySoft },
  guideRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm },
  guideIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: layout.touch,
    paddingVertical: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  logoutText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.danger },

  sheetInput: {
    minHeight: layout.touch + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md - 4,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    // See SearchField.js — same Android top-alignment clipping fix.
    textAlignVertical: "center",
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
});
