import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { fetchStudents } from "../lib/students";
import { fetchStaff } from "../lib/staff";
import {
  fetchDuties,
  fetchAttendanceForDuties,
  resolveGroup,
  submitDuty as submitDutyToDb,
  saveDutyRemark,
  overrideAttendance as overrideAttendanceInDb,
  reassignDuty as reassignDutyInDb,
} from "../lib/duties";
import { fetchHoliday, declareHoliday as declareHolidayInDb, cancelHoliday as cancelHolidayInDb } from "../lib/holidays";
import {
  fetchOpenLeaves,
  signStudentOut as signStudentOutInDb,
  signStudentIn as signStudentInInDb,
} from "../lib/leave";
import { todayISO } from "../utils/format";
import { useAuth } from "./AuthContext";
import { readCache, writeCache, pruneDays, clearCache } from "../lib/cache";

// A tab switch within this long of the last load does not load again. Pull to
// refresh, and every write the app makes, still reload at once.
const SOFT_REFRESH_MS = 20 * 1000;
// The register and the staff list change a few times a term. A quiet refresh
// re-reads them at most this often; a pull to refresh always does.
const CORE_TTL_MS = 10 * 60 * 1000;

/**
 * One source of truth for students, duties and attendance.
 *
 * Every screen reads from here rather than fetching its own copy, so a change
 * made by one role is visible to the others. Without this, the coordinator
 * reassigning a duty and the teacher's list of duties would be two unrelated
 * views of the same row and could disagree.
 */

const SchoolDataContext = createContext(null);

export function SchoolDataProvider({ children }) {
  const { user } = useAuth();
  const staffId = user?.id || null;
  // What is already on screen, so a refresh can tell "show a spinner" (there
  // is nothing yet) from "update quietly underneath" (there is).
  const hasCore = useRef(false);
  const hasDayData = useRef(false);
  const coreAt = useRef(0);
  const lastLoadAt = useRef(0);

  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [duties, setDuties] = useState([]);
  const [trialSettings, setTrialSettings] = useState({});
  // { [dutyId]: { statuses: { admissionNo: code }, submittedBy, submittedAt } }
  const [records, setRecords] = useState({});
  // The declared holiday on `day`, or null. Screens need this to tell an empty
  // Duties list apart from a failed nightly generation — the two look
  // identical and mean opposite things.
  const [holiday, setHoliday] = useState(null);
  // Everyone currently signed out at the gate, as { [admissionNo]: leave }.
  // NOT scoped to `day`: a leave is open until reception closes it, so this is
  // a fact about right now, which is why the marking screen can trust it while
  // looking at any day's register.
  const [openLeaves, setOpenLeaves] = useState({});
  const [loading, setLoading] = useState(true);
  // The day every screen is working on. Today, until somebody picks another.
  //
  // Until this existed there was no route to a past day's DUTY anywhere in
  // the app — Records could read a past day back but offered no way to
  // change it, and Records is on the teacher's tab bar only. So the three
  // roles allowed to correct a submitted register (coordinator, MOD, the
  // Principal's office) could not reach one. The permission existed in the
  // database and had no button attached to it.
  const [day, setSelectedDay] = useState(todayISO());
  const selectedDayRef = useRef(day);
  const loadVersion = useRef(0);
  const followToday = useRef(true);
  const setDay = useCallback((target) => {
    followToday.current = target === todayISO();
    if (target !== selectedDayRef.current) {
      selectedDayRef.current = target;
      loadVersion.current += 1;
      // Never show yesterday's registers beneath tomorrow's date while loading.
      setDuties([]);
      setRecords({});
      setHoliday(null);
      setLoading(true);
      hasDayData.current = false;
      lastLoadAt.current = 0;
    }
    setSelectedDay(target);
  }, []);
  useEffect(() => {
    const rollOver = () => {
      if (followToday.current) {
        const today = todayISO();
        setDay(today);
      }
    };
    const timer = setInterval(rollOver, 30000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") rollOver();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [setDay]);
  const [error, setError] = useState(null);

  /**
   * @param opts.soft  true for "the screen came back into view": skipped if the
   *                   data is under SOFT_REFRESH_MS old, and the register and
   *                   staff list are only re-read once CORE_TTL_MS has passed.
   *                   Anything else (pull to refresh, after a write) is a full
   *                   reload. Screens that pass `refresh` straight to an
   *                   onPress get an event object here, which is not soft.
   */
  const load = useCallback(async (opts) => {
    // A foreground event can arrive between midnight's setDay and its render.
    if (day !== selectedDayRef.current) return;
    // Nobody signed in: row-level security would return nothing anyway.
    if (!staffId) return;
    const soft = opts?.soft === true;
    if (soft && hasDayData.current && Date.now() - lastLoadAt.current < SOFT_REFRESH_MS) return;

    const version = ++loadVersion.current;
    // A spinner only when there is nothing to show. With data (or a cached
    // copy) on screen, the refresh happens underneath it.
    if (!hasDayData.current) setLoading(true);
    setError(null);
    try {
      const coreFresh = soft && hasCore.current && Date.now() - coreAt.current < CORE_TTL_MS;
      const [core, dutyRows, holidayRow, leaveMap, settingsResult] = await Promise.all([
        coreFresh ? null : Promise.all([fetchStudents(), fetchStaff()]),
        fetchDuties(day),
        fetchHoliday(day),
        fetchOpenLeaves(),
        supabase.from("app_env").select("key,value").in("key", ["trial_start", "trial_end", "attendance_mode", "attendance_scope"]),
      ]);
      const settings = Object.fromEntries((settingsResult.data || []).map((row) => [row.key, row.value]));
      // Marks only for duties already submitted — there is nothing to fetch
      // for pending ones — and all of them in one request.
      const submitted = dutyRows.filter((d) => d.state === "submitted");
      const marks = await fetchAttendanceForDuties(submitted.map((d) => d.id));
      const recordMap = Object.fromEntries(
        submitted.map((d) => [
          d.id,
          {
            statuses: marks[d.id] || {},
            submittedBy: d.submittedBy,
            submittedAt: d.submittedAt,
            correctedBy: d.correctedBy,
            correctedAt: d.correctedAt,
          },
        ])
      );
      if (version !== loadVersion.current) return;
      // Publish duties with their saved marks. A correction screen must never
      // see "submitted" before the absences have arrived.
      setRecords(recordMap);
      setTrialSettings(settings);
      if (core) {
        setStudents(core[0]);
        setStaff(core[1]);
        hasCore.current = true;
        coreAt.current = Date.now();
        writeCache(staffId, "core", { students: core[0], staff: core[1] });
      }
      setDuties(dutyRows);
      setHoliday(holidayRow);
      setOpenLeaves(leaveMap);
      hasDayData.current = true;
      lastLoadAt.current = Date.now();
      writeCache(staffId, `day:${day}`, {
        duties: dutyRows,
        records: recordMap,
        holiday: holidayRow,
        openLeaves: leaveMap,
        settings,
      });
      pruneDays(staffId, day);
    } catch (e) {
      if (version === loadVersion.current) setError(e.message || "Could not load school data");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [day, staffId]);

  // INSTANT OPEN: put the last copy this phone saw on screen straight away,
  // then let `load` replace it. Skipped for anything the network has already
  // delivered, so a slow storage read can never overwrite fresher data.
  useEffect(() => {
    if (!staffId) return undefined;
    let cancelled = false;
    (async () => {
      const [core, cached] = await Promise.all([
        readCache(staffId, "core"),
        readCache(staffId, `day:${day}`),
      ]);
      if (cancelled || day !== selectedDayRef.current) return;
      if (core?.value && !hasCore.current) {
        setStudents(core.value.students || []);
        setStaff(core.value.staff || []);
        hasCore.current = true;
        coreAt.current = core.at || 0;
      }
      if (cached?.value && !hasDayData.current) {
        const v = cached.value;
        setDuties(v.duties || []);
        setRecords(v.records || {});
        setHoliday(v.holiday || null);
        setOpenLeaves(v.openLeaves || {});
        setTrialSettings(v.settings || {});
        hasDayData.current = true;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, day]);

  // A different person (or nobody) is now signed in: drop everything the last
  // one could see. On sign-out the saved copy is deleted from the phone too.
  const lastStaffId = useRef(staffId);
  useEffect(() => {
    if (lastStaffId.current === staffId) return;
    const signedOut = !staffId && !!lastStaffId.current;
    lastStaffId.current = staffId;
    loadVersion.current += 1;
    hasCore.current = false;
    hasDayData.current = false;
    coreAt.current = 0;
    lastLoadAt.current = 0;
    setStudents([]);
    setStaff([]);
    setDuties([]);
    setRecords({});
    setHoliday(null);
    setOpenLeaves({});
    setTrialSettings({});
    setLoading(true);
    if (signedOut) clearCache();
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  // A phone may sleep overnight or while a colleague submits/reassigns a duty.
  // Screen focus does not change when the same screen returns from background.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") load({ soft: true });
    });
    return () => subscription.remove();
  }, [load]);

  /**
   * Cached per duty. `resolveGroup` filters and sorts the whole 415-student
   * register, and screens call this inside `renderItem` — on the Duties list
   * that was one full filter+sort per row per render, which is what made
   * scrolling stutter on a low-end phone. The cache is thrown away whenever
   * the register changes, so it can never serve a stale group.
   */
  const groupCache = useMemo(() => new Map(), [students]);
  const studentsForDuty = useCallback(
    (duty) => {
      if (!duty) return [];
      const hit = groupCache.get(duty.id);
      if (hit) return hit;
      const group = resolveGroup(duty, students);
      groupCache.set(duty.id, group);
      return group;
    },
    [groupCache, students]
  );

  const submitDuty = useCallback(
    async (dutyId, statuses, staffId, remark = "") => {
      const duty = duties.find((d) => d.id === dutyId);
      if (!duty) throw new Error("That duty no longer exists.");

      // `staffId` is no longer sent: migrations/010 resolves the submitter
      // from the caller's own token. It is still used below for the optimistic
      // local update, which the next refresh replaces with the server's value.
      await submitDutyToDb({
        dutyId,
        students: resolveGroup(duty, students),
        statuses,
      });

      // The register is in. The note is a second, separate write: if it
      // fails the marks still stand, and the screen says so.
      const note = remark.trim();
      let remarkSaved = true;
      if (note) {
        try {
          await saveDutyRemark(dutyId, note);
        } catch {
          remarkSaved = false;
        }
      }

      if (duty.day !== selectedDayRef.current) return { remarkSaved };
      // A request started before this write may still contain "pending".
      // It must not erase a successful submission when it finally arrives.
      loadVersion.current += 1;
      setLoading(false);

      // Update locally so the UI responds immediately, then reload so every
      // screen sees the same server state.
      setRecords((prev) => ({
        ...prev,
        [dutyId]: { statuses, submittedBy: staffId, submittedAt: new Date().toISOString() },
      }));
      setDuties((prev) =>
        prev.map((d) =>
          d.id === dutyId
            ? { ...d, state: "submitted", submittedBy: staffId, remark: remarkSaved && note ? note : null }
            : d
        )
      );
      return { remarkSaved };
    },
    [duties, students]
  );

  /**
   * Amend a record that is already submitted (SRS A6).
   *
   * Shares one database function with `submitDuty` since migrations/010, which
   * branches on the duty's own state: pending means submit, submitted means
   * correct. Keeping two entry points here is still worth it — they update
   * different local state and say different things to the user — but the app
   * can no longer ask for the wrong write, because it no longer chooses.
   */
  const overrideDuty = useCallback(
    async (dutyId, statuses, staffId) => {
      const duty = duties.find((d) => d.id === dutyId);
      if (!duty) throw new Error("That duty no longer exists.");

      // The database diffs against what is stored and returns how many marks
      // actually changed — the app no longer has to hold a `before` map and
      // hope it matches the row it is about to overwrite.
      const changed = await overrideAttendanceInDb({
        dutyId,
        students: resolveGroup(duty, students),
        statuses,
      });

      if (duty.day !== selectedDayRef.current) return changed;
      loadVersion.current += 1;
      setLoading(false);

      const correctedAt = new Date().toISOString();
      setRecords((prev) => ({
        ...prev,
        [dutyId]: { ...prev[dutyId], statuses, correctedBy: staffId, correctedAt },
      }));
      setDuties((prev) =>
        prev.map((d) =>
          d.id === dutyId ? { ...d, correctedBy: staffId, correctedAt } : d
        )
      );
      return changed;
    },
    [duties, students]
  );

  /**
   * Declare a holiday, or cancel one.
   *
   * Both reload rather than patching local state. Declaring a holiday deletes
   * that day's pending checkpoints inside the database (migration 033), so the
   * duties list this context is holding is wrong the instant the write
   * returns — and "wrong" here means showing a teacher a register she is no
   * longer allowed to submit. A refetch is the only honest answer.
   */
  const declareHoliday = useCallback(
    async (input) => {
      const rows = await declareHolidayInDb(input);
      await load();
      return rows;
    },
    [load]
  );

  const cancelHoliday = useCallback(
    async (targetDay) => {
      await cancelHolidayInDb(targetDay);
      await load();
    },
    [load]
  );

  /**
   * The gate desk. Signing a student out changes what every later checkpoint
   * records for them, so the open-leave map is updated immediately — a
   * teacher's marking screen reads it on every row.
   *
   * The duties and marks are untouched by either call, so this deliberately
   * does NOT do a full `load()`: reception signs children in and out through
   * the day, and refetching the whole 415-student register each time would
   * make the desk unusable on a slow connection.
   */
  const signStudentOut = useCallback(async (input) => {
    const leave = await signStudentOutInDb(input);
    setOpenLeaves((prev) => ({ ...prev, [leave.adm]: leave }));
    return leave;
  }, []);

  const signStudentIn = useCallback(async (adm) => {
    const leave = await signStudentInInDb(adm);
    setOpenLeaves((prev) => {
      const next = { ...prev };
      delete next[adm];
      return next;
    });
    return leave;
  }, []);

  /** Re-read only the gate register — after a sign-out/in made on another
   *  phone. Cheap, and unlike `refresh` it does not flash every screen. */
  const refreshLeaves = useCallback(async () => {
    try {
      setOpenLeaves(await fetchOpenLeaves());
    } catch {
      // The next full load will try again.
    }
  }, []);

  /** The open leave for one student, or null. Used per row while marking. */
  const leaveFor = useCallback((adm) => openLeaves[adm] || null, [openLeaves]);

  const reassignDuty = useCallback(async (dutyId, staffId) => {
    const duty = duties.find((d) => d.id === dutyId);
    await reassignDutyInDb(dutyId, staffId);
    if (duty?.day !== selectedDayRef.current) return;
    loadVersion.current += 1;
    setLoading(false);
    setDuties((prev) => prev.map((d) => (d.id === dutyId ? { ...d, staffId } : d)));
  }, [duties]);


  /** Directory lookups. `staffName` returns "" for an id that is not in the
   *  directory, so a caller can fall back rather than print "undefined". */
  const staffById = useCallback((id) => staff.find((s) => s.id === id) || null, [staff]);
  const staffName = useCallback((id) => staffById(id)?.name || "", [staffById]);

  const value = useMemo(
    () => ({
      students,
      staff,
      duties,
      trialSettings,
      records,
      loading,
      error,
      day,
      setDay,
      isToday: day === todayISO(),
      // The holiday on `day`, or null. `campusClosed` is the distinction that
      // matters to a screen: on a classes-off holiday the boarders are still
      // here and the residential checkpoints are still in the list below.
      holiday,
      campusClosed: !!holiday && !holiday.hostelCheckpoints,
      openLeaves,
      leaveFor,
      refresh: load,
      studentsForDuty,
      staffById,
      staffName,
      submitDuty,
      overrideDuty,
      reassignDuty,
      declareHoliday,
      cancelHoliday,
      signStudentOut,
      signStudentIn,
      refreshLeaves,
    }),
    [
      students,
      staff,
      duties,
      trialSettings,
      records,
      loading,
      error,
      day,
      load,
      setDay,
      studentsForDuty,
      staffById,
      staffName,
      submitDuty,
      overrideDuty,
      reassignDuty,
      holiday,
      openLeaves,
      leaveFor,
      declareHoliday,
      cancelHoliday,
      signStudentOut,
      signStudentIn,
      refreshLeaves,
    ]
  );

  return <SchoolDataContext.Provider value={value}>{children}</SchoolDataContext.Provider>;
}

export function useSchoolData() {
  const ctx = useContext(SchoolDataContext);
  if (!ctx) throw new Error("useSchoolData must be used within SchoolDataProvider");
  return ctx;
}
