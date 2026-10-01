import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { loadReminderPreference, syncDutyReminders } from "../lib/reminders";

/**
 * Keeps the phone's scheduled reminders in step with the roster. Renders
 * nothing.
 *
 * It is a component rather than a hook inside `RootNavigator` so that reading
 * school data costs nothing: the navigator does not subscribe to
 * `SchoolDataContext` today, and making it do so would re-render every tab each
 * time attendance changed. This renders null, so its own re-renders are free.
 *
 * THREE MOMENTS TO RESYNC, and each one is a bug if it is missing:
 *
 *   sign-in / duties load  — a teacher installing the app on Sunday night has
 *                            nothing scheduled until something schedules it.
 *   return to the app      — the schedule runs out after two days, and a
 *                            reassignment made by a coordinator is only visible
 *                            to the phone next time it looks.
 *   after a submission     — the register is marked, so the "closes in 10 min"
 *                            alarm has to be taken off the phone. Without this
 *                            a teacher who marked breakfast at 6:50 is told at
 *                            7:20 that they have not.
 *
 * `duties` covers the first and the third: `submitDuty` flips the duty's state
 * in that same array. The AppState listener covers the second.
 */
export default function DutyReminders() {
  const { user } = useAuth();
  const { duties } = useSchoolData();
  // The sync re-reads the roster itself, so overlapping runs would race on
  // cancel-then-reschedule and could leave the phone holding nothing at all.
  const running = useRef(false);

  const sync = useRef(async (who) => {
    if (running.current) return;
    running.current = true;
    try {
      await syncDutyReminders(who);
    } finally {
      running.current = false;
    }
  }).current;

  // The stored preference has to be read before the first sync, or a teacher
  // who turned reminders off gets them all back on every cold start.
  useEffect(() => {
    let cancelled = false;
    loadReminderPreference().then(() => {
      if (!cancelled) sync(user);
    });
    return () => {
      cancelled = true;
    };
  }, [user, duties, sync]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync(user);
    });
    return () => sub.remove();
  }, [user, sync]);

  return null;
}
