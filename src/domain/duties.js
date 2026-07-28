// Business rules for duties and attendance, kept separate from both the UI
// and the data source. When mockData is replaced by Supabase queries these
// functions stay exactly as they are — they operate on plain objects.
//
// Rules referenced here come from the SRS in docs/reference/.

/** Duty lifecycle as shown to the user. Note this is COMPUTED from the clock;
 *  the database only ever stores 'pending' or 'submitted' (duties.state). */
export const DUTY_STATUS = {
  DONE: "done",
  OVERDUE: "overdue",
  DUE: "due",
  UPCOMING: "upcoming",
};

/** How long before a window closes a duty starts showing as "due now". */
const DUE_LEAD_MIN = 15;

/**
 * @param duty    { id, start, end }  minutes from midnight
 * @param records { [dutyId]: { statuses, at, markedBy } }
 * @param now     minutes from midnight
 */
export const dutyStatus = (duty, records, now) => {
  if (!duty) return DUTY_STATUS.UPCOMING;
  if (records && records[duty.id]) return DUTY_STATUS.DONE;
  if (now > duty.end) return DUTY_STATUS.OVERDUE;
  if (now >= duty.start - DUE_LEAD_MIN) return DUTY_STATUS.DUE;
  return DUTY_STATUS.UPCOMING;
};

export const isActionable = (status) =>
  status === DUTY_STATUS.DUE || status === DUTY_STATUS.OVERDUE;

/**
 * Who has been notified about a late duty (SRS N1–N2).
 * Meal and night checkpoints skip the Coordinator step and go straight to the
 * Principal (SRS C2, `checkpoints.mandatory_escalation`).
 * Returns null when nothing has been sent yet.
 */
export const escalationStage = (duty, now) => {
  if (!duty) return null;
  const late = now - duty.end;
  if (late < -10) return null;
  if (late < 0) return { level: "reminded", text: "Reminder sent to you" };
  if (duty.mandatoryEscalation) return { level: "principal", text: "Escalated to Principal" };
  if (late < 10) return { level: "coordinator", text: "Coordinator & MOD notified" };
  return { level: "principal", text: "Escalated to Principal" };
};

/**
 * Tally a submitted duty. Every status except Absent means the school knows
 * where the child is (SRS S2), so "accounted" and "absent" are the two
 * numbers that matter — not a count per status code.
 */
export const summarise = (totalStudents, statuses) => {
  const marked = statuses ? Object.values(statuses) : [];
  const absent = marked.filter((s) => s === "A").length;
  const elsewhere = marked.length - absent;
  const present = Math.max(0, totalStudents - marked.length);
  return { present, elsewhere, absent, accounted: present + elsewhere, total: totalStudents };
};

/** Split duties into the three groups the Duties screen renders. */
export const groupDuties = (duties, records, now) => {
  const withStatus = (duties || []).map((d) => ({ ...d, status: dutyStatus(d, records, now) }));

  return {
    // Overdue leads — it is the most at-risk work on the list.
    urgent: withStatus
      .filter((d) => isActionable(d.status))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === DUTY_STATUS.OVERDUE ? -1 : 1;
        return a.end - b.end;
      }),
    later: withStatus
      .filter((d) => d.status === DUTY_STATUS.UPCOMING)
      .sort((a, b) => a.start - b.start),
    done: withStatus
      .filter((d) => d.status === DUTY_STATUS.DONE)
      .sort((a, b) => a.start - b.start),
  };
};
