import React, { createContext, useContext, useState } from "react";
import { SEED_RECORDS } from "../data/mockData";

const AttendanceContext = createContext(null);

export function AttendanceProvider({ children }) {
  const [records, setRecords] = useState(SEED_RECORDS);

  const submitDuty = (dutyId, statuses, markedBy) => {
    setRecords((r) => ({ ...r, [dutyId]: { statuses, at: 0, markedBy } }));
  };

  return (
    <AttendanceContext.Provider value={{ records, submitDuty }}>{children}</AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error("useAttendance must be used within AttendanceProvider");
  return ctx;
}
