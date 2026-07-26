// Mock data ported from gurukula-attendance-prototype.jsx, trimmed for the RN app.
// Replace with Supabase-backed queries later (see self-build-guide.md).

const RAW = [
  ["S2401021", "Ankur", 2, "A", "R", 201],
  ["S2401020", "Kartik Kumar", 2, "A", "R", 211],
  ["S2401011", "Krishna Yadav", 2, "A", "R", 212],
  ["S2402002", "Advik Vyas", 3, "A", "R", 301],
  ["S2403003", "Abhilash Sahu", 4, "A", "R", 401],
  ["S2504016", "Agastya Walia", 4, "Vedic", "V", 0],
  ["S2505013", "Aarjyansh Pratap Chauchan", 5, "A", "R", 501],
  ["S2506009", "Aaron Mukherjee", 6, "KRISHNA", "R", 601],
  ["S2102008", "Abhinandan Kumar", 6, "BALRAM", "D", 651],
  ["S2103009", "Aarsh Goswami", 7, "BALRAM", "D", 751],
  ["S2204008", "Adarsh Kumar", 7, "KRISHNA", "R", 701],
  ["S2508001", "Aayansh Agrawal", 8, "BALRAM", "R", 851],
  ["S2306003", "Aarav Behera", 8, "KRISHNA", "R", 801],
  ["S2408022", "Aadarsh Arvind Sahu", 9, "BALRAM", "D", 951],
  ["S2408008", "Aarav Gupta", 9, "KRISHNA", "R", 901],
  ["S2207019", "Adarsh Patidar", 10, "BALRAM", "R", 1051],
  ["S2006082", "Adityavardhana Kashyap", 11, "BALRAM", "R", 1151],
  ["S2209002", "Abhinav Verma", 12, "BALRAM", "R", 1251],
];

const secShort = (sec) => (sec === "A" ? "A" : sec === "Vedic" ? "Vedic" : sec[0]);
const labelOf = (g, sec) => `${g} ${secShort(sec)}`;

export const STUDENTS = RAW.map((r, i) => ({
  id: r[0],
  adm: r[0],
  name: r[1],
  grade: r[2],
  sec: r[3],
  key: `${r[2]}|${r[3]}`,
  label: labelOf(r[2], r[3]),
  type: r[4], // R residential, D day scholar, V vedic (residential)
  roll: r[5],
  remedial: i % 6 === 0,
}));

export const isRes = (s) => s.type === "R" || s.type === "V" || s.type === "B";

export const STATUS_META = {
  A: { label: "Absent", color: "#EB5757" },
  H: { label: "Home", color: "#8B879C" },
  S: { label: "Sick", color: "#F5A623" },
  V: { label: "Activity", color: "#6C5CE7" },
  O: { label: "Outing", color: "#5B8DEF" },
  G: { label: "Gita Nagari", color: "#8E5CE7" },
  Y: { label: "Self study", color: "#2ECC71" },
};
export const SPANNING = ["H", "S", "O", "G"];

// role -> staff profile used for the login screen
export const STAFF = [
  { id: "t1", name: "Krishna Saha Mt", role: "teacher", email: "krishna.saha@gurukula.org", classKey: "4|A", classLabel: "Class 4 A" },
  { id: "t2", name: "Ajay Solanki Pr", role: "teacher", email: "ajay.solanki@gurukula.org", classKey: "9|BALRAM", classLabel: "Class 9 Balram" },
  { id: "c1", name: "Ashram Coordinator", role: "coordinator", email: "coordinator@gurukula.org" },
  { id: "m1", name: "Principal Office", role: "management", email: "principal@gurukula.org" },
  { id: "a1", name: "Admin Desk", role: "admin", email: "admin@gurukula.org" },
  { id: "n1", name: "Sister Nurse", role: "nurse", email: "nurse@gurukula.org" },
];

export const ROLE_LABELS = {
  teacher: "Teacher",
  coordinator: "Coordinator",
  management: "Management",
  admin: "Admin",
  nurse: "Nurse",
};

// Today's duties (simplified — one duty per section/checkpoint most relevant to demo)
export const NOW = 7 * 60 + 42; // 7:42 AM simulated clock
export const fmtTime = (m) => {
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${((h24 + 11) % 12) + 1}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
};

export const DUTIES = [
  { id: "mang", checkpoint: "Mangalarati", group: "All residential students", start: 270, end: 300, staffId: "c1", scope: "res" },
  { id: "morn-4A", checkpoint: "Morning attendance", group: "Class 4 A", start: 450, end: 470, staffId: "t1", classKey: "4|A" },
  { id: "morn-9B", checkpoint: "Morning attendance", group: "Class 9 Balram", start: 450, end: 470, staffId: "t2", classKey: "9|BALRAM" },
  { id: "bfast-sr", checkpoint: "Breakfast prasadam", group: "Senior · residential", start: 405, end: 450, staffId: "t2" },
  { id: "lunch-mid", checkpoint: "Lunch prasadam", group: "Middle · all students", start: 750, end: 790, staffId: "c1" },
  { id: "night-sr", checkpoint: "Night attendance", group: "Senior · residential", start: 1275, end: 1300, staffId: "t2" },
];

export const dutyStatus = (duty, records) => {
  if (records[duty.id]) return "done";
  if (NOW > duty.end) return "overdue";
  if (NOW >= duty.start - 15) return "due";
  return "upcoming";
};

export const studentsForDuty = (duty) => {
  if (duty.classKey) return STUDENTS.filter((s) => s.key === duty.classKey);
  if (duty.scope === "res") return STUDENTS.filter(isRes);
  return STUDENTS;
};

// A couple of pre-seeded submissions so the app doesn't look empty on first load
export const SEED_RECORDS = {
  mang: { statuses: { S2401011: "S" }, at: 296, markedBy: "c1" },
  "bfast-sr": { statuses: {}, at: 448, markedBy: "t2" },
};

export const ALERTS = [
  { id: "al1", kind: "OVERDUE", text: "Breakfast prasadam · Senior residential not submitted", time: "7:50 AM" },
  { id: "al2", kind: "ALERT", text: "R. Sharma (7 K) present at mangalarati, ABSENT at breakfast", time: "8:05 AM" },
  { id: "al3", kind: "OK", text: "Morning attendance 4 A · 24/24 present", time: "7:50 AM" },
];
