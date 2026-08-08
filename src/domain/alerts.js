import { DUTY_STATUS, dutyStatus } from "./duties";

/**
 * Safety alerts, derived from the day's actual attendance.
 *
 * SRS F1: on every submission, each student marked Absent is compared against
 * the same day's earlier checkpoints. A child seen earlier and now missing is
 * the situation this whole system exists to catch, so it is separated from a
 * child who simply has not been seen yet today.
 *
 * Derived rather than stored: the alert is a view of the attendance records,
 * so it can never disagree with them. Only the RESOLUTION is state.
 */

export const ALERT_KIND = {
  /** Seen earlier today, absent now. The urgent case. */
  WENT_MISSING: "went_missing",
  /** Absent, and not recorded present at any earlier checkpoint today. */
  NOT_SEEN: "not_seen",
};

/**
 * @param duties     all of today's duties
 * @param records    { [dutyId]: { statuses } }
 * @param groupOf    (duty) => students in that duty
 * @param now        minutes from midnight
 * @returns alerts, most urgent first
 */
export function deriveAlerts(duties, records, groupOf, now) {
  const submitted = (duties || [])
    .filter((d) => dutyStatus(d, records, now) === DUTY_STATUS.DONE)
    .sort((a, b) => a.start - b.start);

  // Where each student was last accounted for, walking the day in order.
  const lastSeen = new Map();
  const alerts = [];

  for (const duty of submitted) {
    const statuses = records[duty.id]?.statuses || {};
    for (const student of groupOf(duty)) {
      const code = statuses[student.id];

      if (code === "A") {
        const seenAt = lastSeen.get(student.id);
        alerts.push({
          id: `${duty.id}:${student.id}`,
          kind: seenAt ? ALERT_KIND.WENT_MISSING : ALERT_KIND.NOT_SEEN,
          student,
          duty,
          seenAt: seenAt || null,
        });
      } else {
        // Present, or accounted for elsewhere (Home / Sick / Outing / …).
        lastSeen.set(student.id, duty);
      }
    }
  }

  // A student missing from several checkpoints should appear once, against
  // the most recent one — a teacher wants one thing to act on per child.
  const latest = new Map();
  for (const a of alerts) latest.set(a.student.id, a);

  return [...latest.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === ALERT_KIND.WENT_MISSING ? -1 : 1;
    return b.duty.start - a.duty.start;
  });
}

/** Plain-language description of what happened. Deliberately not jargon. */
export function describeAlert(alert) {
  if (alert.kind === ALERT_KIND.WENT_MISSING) {
    return `Was present at ${alert.seenAt.checkpoint}, then marked absent at ${alert.duty.checkpoint}.`;
  }
  return `Marked absent at ${alert.duty.checkpoint}. Not seen at any checkpoint yet today.`;
}

/**
 * Common outcomes, so resolving is a tap rather than typing a sentence on a
 * phone. Free text stays available for anything else.
 */
export const QUICK_REASONS = [
  { id: "found", icon: "checkmark-circle-outline", label: "Found — safe now" },
  { id: "sickbay", icon: "medkit-outline", label: "In the sick bay" },
  { id: "home", icon: "home-outline", label: "Gone home" },
  { id: "teacher", icon: "person-outline", label: "With another teacher" },
  { id: "mistake", icon: "create-outline", label: "Marked by mistake" },
];
