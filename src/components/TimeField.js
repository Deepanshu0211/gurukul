import React, { useState } from "react";
import { Platform, Text, TextInput, TouchableOpacity, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radius, spacing, surface, layout } from "../theme/theme";
import { haptics } from "../lib/haptics";
import { parseHHMM, toHHMM } from "../lib/roster";
import { fmtTime } from "../utils/format";

/**
 * A time, picked on the phone's own clock dial — the one the alarm clock uses.
 * Value is "HH:MM" (24-hour), as the checkpoint form already stores it.
 *
 * `allowMidnight`: the dial has no 24:00, so picking 12:00 AM on a closing time
 * means midnight, the end of the day — which is how every window ends today.
 * The web build has no native dial and keeps a typed field.
 */
export default function TimeField({ value, onChange, label, allowMidnight = false }) {
  const [iosOpen, setIosOpen] = useState(false);
  const minutes = parseHHMM(value);

  if (Platform.OS === "web") {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="16:30"
        placeholderTextColor={colors.icon}
        style={[styles.box, styles.text]}
        maxLength={5}
        accessibilityLabel={label}
      />
    );
  }

  const asDate = () => {
    const d = new Date();
    const m = minutes == null || minutes >= 1440 ? 0 : minutes;
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return d;
  };

  const take = (date) => {
    let m = date.getHours() * 60 + date.getMinutes();
    if (allowMidnight && m === 0) m = 1440;
    haptics.success();
    onChange(toHHMM(m));
  };

  const open = () => {
    haptics.select();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: asDate(),
        mode: "time",
        is24Hour: false,
        onChange: (event, date) => {
          if (event.type === "set" && date) take(date);
        },
      });
    } else {
      setIosOpen((o) => !o);
    }
  };

  const shown =
    minutes == null ? "Set time" : minutes >= 1440 ? "Midnight" : fmtTime(minutes);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.75}
        style={styles.box}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown}. Change`}
      >
        <Ionicons name="time-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.text, minutes == null && { color: colors.icon }]}>{shown}</Text>
      </TouchableOpacity>
      {Platform.OS === "ios" && iosOpen && (
        <DateTimePicker
          value={asDate()}
          mode="time"
          display="spinner"
          onChange={(_, date) => date && take(date)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  box: {
    ...surface.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    minHeight: layout.touch + 12,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md - 4,
  },
  text: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text, textAlign: "center" },
});
