import { isOversight } from "../domain/roles";
import { VEDIC_CLASS_KEY, classIncludesStudent, isVedicStudent } from "../domain/classGroups";
import { resolveGroup } from "./duties";

/** Records follows the academic class; checkpoint assignments belong to Duties. */
export const recordRoster = (duty, students, user) => {
  const group = resolveGroup(duty, students).filter(s => !duty.studentIds || duty.studentIds.includes(s.id));
  if (isOversight(user?.role)) return group;
  if (!user?.classKey) return [];
  return group.filter((student) => classIncludesStudent(user.classKey, student));
};

export const recordDuties = (duties, students, user) => {
  if (isOversight(user?.role)) return duties;
  if (!user?.classKey) return [];
  return duties.filter(duty => recordRoster(duty, students, user).length > 0);
};

export const recordAbsences = (duties, records, students, user) =>
  duties.reduce((total, duty) => total + recordRoster(duty, students, user)
    .filter((student) => records[duty.id]?.statuses?.[student.id] === "A").length, 0);

/** Read-only categories for saved registers. Source IDs, marks and authors stay intact. */
export function groupAttendanceRecords(duties, records, students) {
  const groupedDuties = [];
  const groupedRecords = {};
  const vedicGroups = new Map();
  for (const duty of duties) {
    const record = records[duty.id];
    if (!record) continue;
    const roster = resolveGroup(duty, students);
    const regular = roster.filter(s => !isVedicStudent(s));
    if (regular.length) {
      groupedDuties.push({ ...duty, excludeVedic: true, studentIds: regular.map(s => s.id) });
      groupedRecords[duty.id] = record;
    }
    const vedic = roster.filter(isVedicStudent);
    if (!vedic.length) continue;
    const id = `vedic-record:${duty.day}:${duty.checkpointId}`;
    let group = vedicGroups.get(id);
    if (group) group.record.submittedAt = null;
    if (!group) {
      group = {
        duty: { ...duty, id, classKey: VEDIC_CLASS_KEY, group: "Vedic", scope: "all",
          excludeVedic: false, studentIds: [] },
        record: { statuses: {}, submittedByIds: [], sources: {}, submittedAt: record.submittedAt },
      };
      vedicGroups.set(id, group);
    }
    for (const student of vedic) {
      if (group.record.sources[student.id]) return { duties: [], records: {},
        error: "Duplicate saved attendance was found for a Vedic student. Ask the coordinator to check this day." };
      group.duty.studentIds.push(student.id);
      group.record.statuses[student.id] = record.statuses?.[student.id] || null;
      group.record.sources[student.id] = { ...record, dutyId: duty.id };
    }
    if (record.submittedBy && !group.record.submittedByIds.includes(record.submittedBy)) {
      group.record.submittedByIds.push(record.submittedBy);
    }
    // A combined category has several source times, not one invented submission time.
    group.record.submittedBy = group.record.submittedByIds.length === 1 ? group.record.submittedByIds[0] : null;
  }
  for (const { duty, record } of vedicGroups.values()) {
    groupedDuties.push(duty);
    groupedRecords[duty.id] = record;
  }
  groupedDuties.sort((a, b) => a.start - b.start ||
    Number(a.classKey === VEDIC_CLASS_KEY) - Number(b.classKey === VEDIC_CLASS_KEY) ||
    a.group.localeCompare(b.group, undefined, { numeric: true }));
  return { duties: groupedDuties, records: groupedRecords };
}
