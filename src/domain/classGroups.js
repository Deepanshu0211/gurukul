/** Academic classes stay on students; attendance groups are derived from them. */
export const VEDIC_CLASS_KEY = "*|VEDIC";
export const isVedicClass = key => key === VEDIC_CLASS_KEY;
export const isVedicStudent = student => String(student.sec ?? student.section ?? student.key?.split("|")[1] ?? "").trim().toUpperCase() === "VEDIC";
export const combinedClassGrade = key => {
  const match = /^(\d+)\|\*$/.exec(key || "");
  return match ? Number(match[1]) : null;
};
export const isCombinedClass = key => isVedicClass(key) || combinedClassGrade(key) !== null;
export const classIncludesStudent = (key, student) => {
  if (isVedicClass(key)) return isVedicStudent(student);
  const grade = combinedClassGrade(key);
  if (grade === null) return student.key === key;
  return Number(student.grade) === grade;
};
export const classCoversClass = (registerKey, studentClassKey) => {
  if (registerKey === studentClassKey) return true;
  if (isVedicClass(registerKey)) return isVedicStudent({key:studentClassKey});
  const grade = combinedClassGrade(registerKey);
  return grade !== null && Number((studentClassKey || "").split("|")[0]) === grade && !isVedicStudent({key:studentClassKey});
};
/** Academic grades/sections on students are never rewritten. */
export const scopeAttendanceQuery = (query, key) => {
  if (!key) return query;
  if (isVedicClass(key)) return query.ilike("section", "vedic");
  const grade = combinedClassGrade(key);
  if (grade === null) return query.eq("class_key", key);
  return query.eq("grade", grade).not("section", "ilike", "vedic");
};
/** Visible row copy also used in tests: Vedic rows retain their original class. */
export const attendanceStudentLabel = (student, duty) => isVedicClass(duty?.classKey)
  ? `Class ${student.grade} Vedic`
  : combinedClassGrade(duty?.classKey) !== null ? student.label.split(" ").slice(1).join(" ") : "";
