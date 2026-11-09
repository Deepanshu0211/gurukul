/** Academic classes stay on students; attendance groups are derived from them. */
export const VEDIC_CLASS_KEY = "*|VEDIC";
export const isVedicClass = key => key === VEDIC_CLASS_KEY;
export const isVedicStudent = student => String(student.sec ?? student.section ?? student.key?.split("|")[1] ?? "").trim().toUpperCase() === "VEDIC";
export const combinedClassGrade = key => {
  const match = /^(\d+)\|\*$/.exec(key || "");
  return match ? Number(match[1]) : null;
};
export const isCombinedClass = key => isVedicClass(key) || combinedClassGrade(key) !== null;
/** A register can name several classes, comma-separated: "1|A,2|A,5|A" (046). */
export const classKeyList = (key) => String(key || "").split(",").map((k) => k.trim()).filter(Boolean);
export const isClassList = (key) => classKeyList(key).length > 1;
export const classIncludesStudent = (key, student) => {
  if (isClassList(key)) return classKeyList(key).some((k) => classIncludesStudent(k, student));
  if (isVedicClass(key)) return isVedicStudent(student);
  const grade = combinedClassGrade(key);
  if (grade === null) return student.key === key;
  return Number(student.grade) === grade;
};
export const classCoversClass = (registerKey, studentClassKey) => {
  if (isClassList(registerKey)) return classKeyList(registerKey).some((k) => classCoversClass(k, studentClassKey));
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

/**
 * Every class that has students in it, in register order (grade, then section),
 * with its size. Built from the register rather than a fixed list so a class
 * the school adds appears in every picker without a code change.
 */
export const listClasses = (students) => {
  const byKey = new Map();
  for (const s of students || []) {
    if (!byKey.has(s.key)) byKey.set(s.key, { key: s.key, label: s.label, grade: s.grade, students: 0 });
    byKey.get(s.key).students += 1;
  }
  return [...byKey.values()].sort((a, b) => {
    const [ga, sa] = a.key.split("|");
    const [gb, sb] = b.key.split("|");
    return Number(ga) - Number(gb) || sa.localeCompare(sb);
  });
};
