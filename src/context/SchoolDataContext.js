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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [studentRows, staffRows, dutyRows] = await Promise.all([
        fetchStudents(),
        fetchStaff(),
        fetchDuties(),
      ]);
      setStudents(studentRows);
      setStaff(staffRows);
      setDuties(dutyRows);

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
  }, []);

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

      await submitDutyToDb({
        dutyId,
        students: resolveGroup(duty, students),
        statuses,
        staffId,
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
   * Amend a record that is already submitted (SRS A6). Kept separate from
   * `submitDuty` rather than folded into it: the two write different columns,
   * only one of them is audit-logged, and a caller must not be able to reach
   * for the wrong one by passing a different argument.
   */
  const overrideDuty = useCallback(
    async (dutyId, statuses, staffId) => {
      const duty = duties.find((d) => d.id === dutyId);
      if (!duty) throw new Error("That duty no longer exists.");

      const changed = await overrideAttendanceInDb({
        dutyId,
        students: resolveGroup(duty, students),
        statuses,
        before: records[dutyId]?.statuses || {},
        staffId,
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
    [duties, students, records]
  );

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
      refresh: load,
      studentsForDuty,
      staffById,
      staffName,
      submitDuty,
      overrideDuty,
      reassignDuty,
    }),
    [
      students,
      staff,
      duties,
      records,
      loading,
      error,
      load,
      studentsForDuty,
      staffById,
      staffName,
      submitDuty,
      overrideDuty,
      reassignDuty,
    ]
  );

  return <SchoolDataContext.Provider value={value}>{children}</SchoolDataContext.Provider>;
}

export function useSchoolData() {
  const ctx = useContext(SchoolDataContext);
  if (!ctx) throw new Error("useSchoolData must be used within SchoolDataProvider");
  return ctx;
}
