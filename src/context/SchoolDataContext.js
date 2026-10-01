import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchStudents } from "../lib/students";
import { fetchStaff } from "../lib/staff";
import {
  fetchDuties,
  fetchAttendance,
  resolveGroup,
  submitDuty as submitDutyToDb,
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
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [duties, setDuties] = useState([]);
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
  const [day, setDay] = useState(todayISO());
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [studentRows, staffRows, dutyRows, holidayRow, leaveMap] = await Promise.all([
        fetchStudents(),
        fetchStaff(),
        fetchDuties(day),
        fetchHoliday(day),
        fetchOpenLeaves(),
      ]);
      setStudents(studentRows);
      setStaff(staffRows);
      setDuties(dutyRows);
      setHoliday(holidayRow);
      setOpenLeaves(leaveMap);

      // Pull attendance only for duties already submitted — there is nothing
      // to fetch for pending ones, and it keeps the initial load small.
      const submitted = dutyRows.filter((d) => d.state === "submitted");
      const entries = await Promise.all(
        submitted.map(async (d) => [
          d.id,
          {
            statuses: await fetchAttendance(d.id),
            submittedBy: d.submittedBy,
            submittedAt: d.submittedAt,
            correctedBy: d.correctedBy,
            correctedAt: d.correctedAt,
          },
        ])
      );
      setRecords(Object.fromEntries(entries));
    } catch (e) {
      setError(e.message || "Could not load school data");
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
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
    async (dutyId, statuses, staffId) => {
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

      // Update locally so the UI responds immediately, then reload so every
      // screen sees the same server state.
      setRecords((prev) => ({
        ...prev,
        [dutyId]: { statuses, submittedBy: staffId, submittedAt: new Date().toISOString() },
      }));
      setDuties((prev) =>
        prev.map((d) => (d.id === dutyId ? { ...d, state: "submitted", submittedBy: staffId } : d))
      );
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

  /** The open leave for one student, or null. Used per row while marking. */
  const leaveFor = useCallback((adm) => openLeaves[adm] || null, [openLeaves]);

  const reassignDuty = useCallback(async (dutyId, staffId) => {
    await reassignDutyInDb(dutyId, staffId);
    setDuties((prev) => prev.map((d) => (d.id === dutyId ? { ...d, staffId } : d)));
  }, []);

  /** Directory lookups. `staffName` returns "" for an id that is not in the
   *  directory, so a caller can fall back rather than print "undefined". */
  const staffById = useCallback((id) => staff.find((s) => s.id === id) || null, [staff]);
  const staffName = useCallback((id) => staffById(id)?.name || "", [staffById]);

  const value = useMemo(
    () => ({
      students,
      staff,
      duties,
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
    }),
    [
      students,
      staff,
      duties,
      records,
      loading,
      error,
      day,
      load,
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
    ]
  );

  return <SchoolDataContext.Provider value={value}>{children}</SchoolDataContext.Provider>;
}

export function useSchoolData() {
  const ctx = useContext(SchoolDataContext);
  if (!ctx) throw new Error("useSchoolData must be used within SchoolDataProvider");
  return ctx;
}
