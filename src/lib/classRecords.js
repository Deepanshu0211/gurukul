import { isOversight } from "../domain/roles";
import { classCoversClass } from "../domain/classGroups";
import { resolveGroup } from "./duties";

/** Records follows the academic class; checkpoint assignments belong to Duties. */
export const recordRoster = (duty, students, user) => {
  const group = resolveGroup(duty, students);
  if (isOversight(user?.role)) return group;
  if (!user?.classKey) return [];
  return group.filter((student) => student.key === user.classKey);
};

export const recordDuties = (duties, students, user) => {
  if (isOversight(user?.role)) return duties;
  if (!user?.classKey) return [];
  return duties.filter((duty) =>
    (!duty.classKey || classCoversClass(duty.classKey, user.classKey)) &&
    recordRoster(duty, students, user).length > 0
  );
};

export const recordAbsences = (duties, records, students, user) =>
  duties.reduce((total, duty) => total + recordRoster(duty, students, user)
    .filter((student) => records[duty.id]?.statuses?.[student.id] === "A").length, 0);
