import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchStudents } from "../lib/students";
import {
  fetchDuties,
  fetchAttendance,
  resolveGroup,
  submitDuty as submitDutyToDb,
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
  const [duties, setDuties] = useState([]);
  // { [dutyId]: { statuses: { admissionNo: code }, submittedBy, submittedAt } }
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [studentRows, dutyRows] = await Promise.all([fetchStudents(), fetchDuties()]);
      setStudents(studentRows);
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

  const studentsForDuty = useCallback(
    (duty) => resolveGroup(duty, students),
    [students]
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

  const reassignDuty = useCallback(async (dutyId, staffId) => {
    await reassignDutyInDb(dutyId, staffId);
    setDuties((prev) => prev.map((d) => (d.id === dutyId ? { ...d, staffId } : d)));
  }, []);

  const value = useMemo(
    () => ({
      students,
      duties,
      records,
      loading,
      error,
      refresh: load,
      studentsForDuty,
      submitDuty,
      reassignDuty,
    }),
    [students, duties, records, loading, error, load, studentsForDuty, submitDuty, reassignDuty]
  );

  return <SchoolDataContext.Provider value={value}>{children}</SchoolDataContext.Provider>;
}

export function useSchoolData() {
  const ctx = useContext(SchoolDataContext);
  if (!ctx) throw new Error("useSchoolData must be used within SchoolDataProvider");
  return ctx;
}
