/** A grade register uses `10|*`; a section register keeps `10|KRISHNA`. */
export const combinedClassGrade = (key) => {
  const match = /^(\d+)\|\*$/.exec(key || "");
  return match ? Number(match[1]) : null;
};

export const classIncludesStudent = (key, student) => {
  const grade = combinedClassGrade(key);
  return grade === null ? student.key === key : Number(student.grade) === grade;
};

export const classCoversClass = (registerKey, studentClassKey) => {
  if (registerKey === studentClassKey) return true;
  const grade = combinedClassGrade(registerKey);
  return grade !== null && Number((studentClassKey || "").split("|")[0]) === grade;
};

/** attendance_detail stores the student's grade and original section key. */
export const scopeAttendanceQuery = (query, key) => {
  if (!key) return query;
  const grade = combinedClassGrade(key);
  return grade === null ? query.eq("class_key", key) : query.eq("grade", grade);
};

/** A section's history includes its combined-grade and school-wide registers. */
export const scopeDutyHistoryQuery = (query, key) => {
  if (!key) return query;
  const grade = combinedClassGrade(key);
  const quote = (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (grade !== null) return query.or(`class_key.like.${quote(`${grade}|%`)},class_key.is.null`);
  const combined = `${key.split("|")[0]}|*`;
  return query.or(`class_key.eq.${quote(key)},class_key.eq.${quote(combined)},class_key.is.null`);
};
