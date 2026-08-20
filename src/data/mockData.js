// Mock data ported from gurukula-attendance-prototype.jsx, trimmed for the RN app.
// Replace with Supabase-backed queries later (see self-build-guide.md).

// Generated names, matching docs/data/students_415.csv. Nothing here is a real
// student — see docs/data/README.md.
//
// Screens read students from Supabase via SchoolDataContext; this small set
// only exists so components can be rendered in isolation.
const RAW = [
  ["S2401021", "Aarav Sharma", 2, "A", "R", 201],
  ["S2401020", "Vihaan Patel", 2, "A", "R", 211],
  ["S2401011", "Rohan Mehta", 2, "A", "R", 212],
  ["S2402002", "Kabir Singh", 3, "A", "R", 301],
  ["S2403003", "Damodar Rathore", 4, "A", "R", 401],
  ["S2504016", "Nimai Joshi", 4, "Vedic", "V", 0],
  ["S2505013", "Advait Kulkarni", 5, "A", "R", 501],
  ["S2506009", "Keshav Nair", 6, "KRISHNA", "R", 601],
  ["S2102008", "Anirudh Verma", 6, "BALRAM", "D", 651],
  ["S2103009", "Tejas Pandey", 7, "BALRAM", "D", 751],
  ["S2204008", "Madhav Reddy", 7, "KRISHNA", "R", 701],
  ["S2508001", "Shaurya Gupta", 8, "BALRAM", "R", 851],
  ["S2306003", "Vedant Iyer", 8, "KRISHNA", "R", 801],
  ["S2408022", "Pranav Chauhan", 9, "BALRAM", "D", 951],
  ["S2408008", "Arjun Malhotra", 9, "KRISHNA", "R", 901],
  ["S2207019", "Yash Tiwari", 10, "BALRAM", "R", 1051],
  ["S2006082", "Siddharth Rao", 11, "BALRAM", "R", 1151],
  ["S2209002", "Ishaan Bansal", 12, "BALRAM", "R", 1251],
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
  // Absent is the only unaccounted-for state — it stays red and loud on
  // purpose. Every other status means the school knows where the child is,
  // so they read as neutral greys in the minimal theme and are told apart
  // by their label, not their colour.
  A: { label: "Absent", color: "#8E1F3C" },
  H: { label: "Home", color: "#3E4F4D" },
  S: { label: "Sick", color: "#3E4F4D" },
  V: { label: "Activity", color: "#3E4F4D" },
  O: { label: "Outing", color: "#3E4F4D" },
  G: { label: "Gita Nagari", color: "#3E4F4D" },
  Y: { label: "Self study", color: "#3E4F4D" },
};
export const SPANNING = ["H", "S", "O", "G"];

// role -> staff profile used for the login screen
export const STAFF = [
  { id: "t1", name: "Krishna Saha Mt", role: "teacher", email: "krishna.saha@bgis.org", classKey: "4|A", classLabel: "Class 4 A" },
  { id: "t2", name: "Ajay Solanki Pr", role: "teacher", email: "ajay.solanki@bgis.org", classKey: "9|BALRAM", classLabel: "Class 9 Balram" },
  { id: "c1", name: "Ashram Coordinator", role: "coordinator", email: "coordinator@bgis.org" },
  { id: "m1", name: "Principal Office", role: "management", email: "principal@bgis.org" },
  { id: "a1", name: "Admin Desk", role: "admin", email: "admin@bgis.org" },
  { id: "n1", name: "Sister Nurse", role: "nurse", email: "nurse@bgis.org" },
];

// ROLE_LABELS moved to domain/roles.js — it is presentation copy tied to what
// each role may do, not mock data. Import it from there.

// The simulated 7:42 AM clock that used to live here is gone — the app reads
// the real one via `useNow()` in src/lib/clock.js. Formatting helpers live in
// utils/format.js; duty rules live in domain/duties.js — this file holds
// DATA only.

// `mandatoryEscalation` mirrors checkpoints.mandatory_escalation in the real
// schema (SRS C2): meal and night checkpoints escalate straight to the
// Principal on a miss, skipping the usual Coordinator step.
export const DUTIES = [
  { id: "mang", checkpoint: "Mangalarati", group: "All residential students", start: 270, end: 300, staffId: "c1", scope: "res" },
  { id: "morn-4A", checkpoint: "Morning attendance", group: "Class 4 A", start: 450, end: 470, staffId: "t1", classKey: "4|A" },
  { id: "morn-9B", checkpoint: "Morning attendance", group: "Class 9 Balram", start: 450, end: 470, staffId: "t2", classKey: "9|BALRAM" },
  { id: "bfast-sr", checkpoint: "Breakfast prasadam", group: "Senior · residential", start: 405, end: 450, staffId: "t2", mandatoryEscalation: true },
  { id: "lunch-mid", checkpoint: "Lunch prasadam", group: "Middle · all students", start: 750, end: 790, staffId: "c1" },
  { id: "night-sr", checkpoint: "Night attendance", group: "Senior · residential", start: 1275, end: 1300, staffId: "t2", mandatoryEscalation: true },
];

/**
 * Resolves a duty's group definition to its students. Mirrors the real
 * grouping rules (class-section, residential-only, whole school) so the
 * Supabase version can drop in with the same signature.
 */
export const studentsForDuty = (duty) => {
  if (!duty) return [];
  if (duty.classKey) return STUDENTS.filter((s) => s.key === duty.classKey);
  if (duty.scope === "res") return STUDENTS.filter(isRes);
  return STUDENTS;
};

// A couple of pre-seeded submissions so the app doesn't look empty on first load
export const SEED_RECORDS = {
  mang: { statuses: { S2401011: "S" }, at: 296, markedBy: "c1" },
  "bfast-sr": { statuses: {}, at: 448, markedBy: "t2" },
};

// Alerts are no longer mock data — they are derived from real attendance in
// domain/alerts.js (SRS F1), so they can never disagree with the marks.

