import { useState, useMemo } from "react";
import * as XLSX from "xlsx";

const RAW = [
  // The school's real 2025-26 register was embedded here. It has been removed:
  // this repository is public and those were real children's names, admission
  // numbers and residential status.
  //
  // A generated stand-in with the same structure lives in
  // docs/data/students_415.csv. Format was:
  //   [admissionNo, name, grade, section, type, house, rollNo]
  ["S0000001", "Sample Student", 4, "A", "R", "GOVARDHAN", 401],
];

// ---------- Derived data ----------
const secShort = (sec) => (sec === "A" ? "A" : sec === "Vedic" ? "Vedic" : sec[0]); // KRISHNA->K, BALRAM->B
const keyOf = (g, sec) => `${g}|${sec}`;
const labelOf = (g, sec) => `${g} ${secShort(sec)}`;

const INITIAL_STUDENTS = RAW.map((r, i) => ({
  id: r[0], adm: r[0], name: r[1], grade: r[2], sec: r[3],
  key: keyOf(r[2], r[3]), label: labelOf(r[2], r[3]),
  type: r[4], house: r[5], roll: r[6], remedial: i % 12 === 0,
}));

const SECTION_KEYS = [...new Set(INITIAL_STUDENTS.map((s) => s.key))];
const SECTIONS = SECTION_KEYS.map((k) => {
  const [g, sec] = k.split("|");
  return { key: k, grade: +g, sec, label: labelOf(+g, sec) };
}).sort((a, b) => a.grade - b.grade || a.sec.localeCompare(b.sec));

const CLASS_TEACHERS = {
  "2|A": "Atma Ram Pr", "3|A": "Dharmshila Mt", "4|A": "Krishna Saha Mt", "5|A": "Annu Ag Mt",
  "4|Vedic": "Vedic In-charge", "5|Vedic": "Vedic In-charge", "6|Vedic": "Vedic In-charge", "7|Vedic": "Vedic In-charge", "8|Vedic": "Vedic In-charge",
  "6|KRISHNA": "Vaidhehi Mt", "6|BALRAM": "Sadanand Mt", "7|KRISHNA": "Sarita Mt", "7|BALRAM": "Balaram Pr",
  "8|KRISHNA": "Sakshi Nimai Pr", "8|BALRAM": "Gopi Priya Mt", "9|KRISHNA": "Geetanjali Mt", "9|BALRAM": "Ajay Solanki Pr",
  "10|KRISHNA": "Nimai Sundar Pr", "10|BALRAM": "Nimai Sundar Pr", "11|KRISHNA": "Manish Pr", "11|BALRAM": "Manish Pr",
  "12|KRISHNA": "Brajraj Pr", "12|BALRAM": "Krishna Bhakti Mt",
};
const OTHER_STAFF = ["Ashram Coordinator", "MOD", "Prasadam In-charge", "Sports Teacher 1", "Sports Teacher 2", "Sports Teacher 3", "Ashram Teacher 1", "Ashram Teacher 2", "Ashram Teacher 3", "Remedial In-charge"];
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const INITIAL_TEACHERS = [
  ...[...new Set(Object.values(CLASS_TEACHERS))].map((n) => ({ id: slug(n), name: n, role: "Class teacher" })),
  ...OTHER_STAFF.map((n) => ({ id: slug(n), name: n, role: "Duty staff" })),
];

const isRes = (s) => s.type === "R" || s.type === "V" || s.type === "B";
const bandOf = (g) => (g <= 5 ? "Primary" : g <= 8 ? "Middle" : "Senior");
const BANDS = [
  { name: "Primary", min: 2, max: 5, label: "Primary (Gr 2–5)" },
  { name: "Middle", min: 6, max: 8, label: "Middle (Gr 6–8)" },
  { name: "Senior", min: 9, max: 12, label: "Senior (Gr 9–12)" },
];

const inScope = (s, scope) => (scope === "res" ? isRes(s) : scope === "day" ? !isRes(s) : true);
const scopeOf = (pop) => (pop.kind === "res-all" ? "res" : pop.scope || (pop.resOnly ? "res" : "all"));
const SCOPE_LABEL = { all: "All students", res: "Residential only", day: "Day scholars only" };
function popStudents(pop, students) {
  const sc = scopeOf(pop);
  if (pop.kind === "res-all") return students.filter(isRes);
  if (pop.kind === "section") return students.filter((s) => s.key === pop.key && inScope(s, sc));
  if (pop.kind === "band") return students.filter((s) => s.grade >= pop.min && s.grade <= pop.max && inScope(s, sc));
  if (pop.kind === "remedial") return students.filter((s) => s.remedial && inScope(s, sc));
  return [];
}

// ---------- Duties for today ----------
function buildDuties() {
  const d = [];
  d.push({ id: "mang", checkpoint: "Mangalarati", groupLabel: "All residential students", pop: { kind: "res-all" }, start: 270, end: 300, teacherId: slug("Ashram Coordinator") });
  SECTIONS.forEach((s) => d.push({
    id: `morn-${s.key}`, checkpoint: "Morning attendance", groupLabel: `Class ${s.label}`,
    pop: { kind: "section", key: s.key }, start: 450, end: 470,
    teacherId: slug(CLASS_TEACHERS[s.key] || "Ashram Coordinator"),
  }));
  const bk = [slug("Prasadam In-charge"), slug("Sakshi Nimai Pr"), slug("Ajay Solanki Pr")];
  BANDS.forEach((b, i) => d.push({ id: `bfast-${b.name}`, checkpoint: "Breakfast prasadam", groupLabel: `${b.label} · residential`, pop: { kind: "band", min: b.min, max: b.max, scope: "res" }, start: 405, end: 450, teacherId: bk[i] }));
  const lu = [slug("MOD"), slug("Prasadam In-charge"), slug("Ashram Coordinator")];
  BANDS.forEach((b, i) => d.push({ id: `lunch-${b.name}`, checkpoint: "Lunch prasadam", groupLabel: `${b.label} · all students`, pop: { kind: "band", min: b.min, max: b.max, scope: "all" }, start: 750, end: 790, teacherId: lu[i] }));
  BANDS.forEach((b, i) => d.push({ id: `sport-${b.name}`, checkpoint: "Evening sports", groupLabel: b.label, pop: { kind: "band", min: b.min, max: b.max, scope: "all" }, start: 990, end: 1030, teacherId: slug(`Sports Teacher ${i + 1}`) }));
  d.push({ id: "remedial-res", checkpoint: "Remedial class", groupLabel: "Remedial batch · residential", pop: { kind: "remedial", scope: "res" }, start: 1035, end: 1065, teacherId: slug("Remedial In-charge") });
  d.push({ id: "remedial-ds", checkpoint: "Remedial class", groupLabel: "Remedial batch · day scholars", pop: { kind: "remedial", scope: "day" }, start: 1035, end: 1065, teacherId: slug("Dharmshila Mt") });
  BANDS.forEach((b, i) => d.push({ id: `study-${b.name}`, checkpoint: "Evening self study", groupLabel: `${b.label} · residential`, pop: { kind: "band", min: b.min, max: b.max, scope: "res" }, start: 1110, end: 1140, teacherId: slug(`Ashram Teacher ${i + 1}`) }));
  BANDS.forEach((b, i) => d.push({ id: `dinner-${b.name}`, checkpoint: "Dinner prasadam", groupLabel: `${b.label} · residential`, pop: { kind: "band", min: b.min, max: b.max, scope: "res" }, start: 1155, end: 1195, teacherId: slug("Prasadam In-charge") }));
  BANDS.forEach((b, i) => d.push({ id: `night-${b.name}`, checkpoint: "Night attendance", groupLabel: `${b.label} · residential`, pop: { kind: "band", min: b.min, max: b.max, scope: "res" }, start: 1275, end: 1300, teacherId: slug(`Ashram Teacher ${i + 1}`) }));
  return d;
}
const INITIAL_DUTIES = buildDuties();

// Simulated clock: 07:42 AM
const NOW = 7 * 60 + 42;
const fmt = (m) => {
  const h24 = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return `${((h24 + 11) % 12) + 1}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
};

// ---------- Seed records (a realistic morning in progress) ----------
function buildSeeds() {
  const rec = {};
  const resAll = popStudents({ kind: "res-all" }, INITIAL_STUDENTS);
  const mangStatuses = {};
  [40, 130, 220].forEach((i) => { if (resAll[i]) mangStatuses[resAll[i].id] = "S"; });
  [75, 190].forEach((i) => { if (resAll[i]) mangStatuses[resAll[i].id] = "H"; });
  rec["mang"] = { statuses: mangStatuses, markedBy: slug("Ashram Coordinator"), at: 296 };

  SECTIONS.forEach((s, i) => {
    if (s.key === "4|A") return; // pending — the live demo duty
    const list = popStudents({ kind: "section", key: s.key }, INITIAL_STUDENTS);
    const st = {};
    if (i % 4 === 0 && list[1]) st[list[1].id] = "S";
    if (i % 5 === 2 && list[2]) st[list[2].id] = "H";
    if (i % 7 === 3 && list[4]) st[list[4].id] = "A";
    rec[`morn-${s.key}`] = { statuses: st, markedBy: slug(CLASS_TEACHERS[s.key] || "Ashram Coordinator"), at: 454 + (i % 6) };
  });

  const prim = popStudents({ kind: "band", min: 2, max: 5, scope: "res" }, INITIAL_STUDENTS);
  const bst = {};
  if (prim[10]) bst[prim[10].id] = "A";
  if (prim[30]) bst[prim[30].id] = "A";
  if (prim[50]) bst[prim[50].id] = "S";
  rec["bfast-Primary"] = { statuses: bst, markedBy: slug("Prasadam In-charge"), at: 448 };
  rec["bfast-Middle"] = { statuses: {}, markedBy: slug("Sakshi Nimai Pr"), at: 445 };
  // bfast-Senior deliberately missing -> overdue
  return rec;
}
const SEED_RECORDS = buildSeeds();

const STATUS_META = {
  A: { label: "Absent", cls: "bg-red-600 text-white", accounted: false },
  H: { label: "Home", cls: "bg-stone-500 text-white", accounted: true },
  S: { label: "Sick", cls: "bg-amber-500 text-white", accounted: true },
  V: { label: "Activity", cls: "bg-violet-600 text-white", accounted: true },
  O: { label: "Outing", cls: "bg-blue-600 text-white", accounted: true },
  G: { label: "Gita Nagari", cls: "bg-indigo-600 text-white", accounted: true },
  Y: { label: "Self study", cls: "bg-teal-600 text-white", accounted: true },
};

const SPANNING = ["H", "S", "O", "G"];

function dutyStatus(duty, records) {
  if (records[duty.id]) return "done";
  if (NOW > duty.end) return "overdue";
  if (NOW >= duty.start - 15) return "due";
  return "upcoming";
}
const STATUS_STYLE = {
  done: "bg-emerald-100 text-emerald-800",
  overdue: "bg-red-100 text-red-700",
  due: "bg-amber-100 text-amber-800",
  upcoming: "bg-stone-100 text-stone-500",
};
const STATUS_LABEL = { done: "Submitted", overdue: "Overdue", due: "Due now", upcoming: "Upcoming" };

function summarize(list, statuses) {
  const c = { res: 0, day: 0, resP: 0, resA: 0, dayP: 0, dayA: 0, S: 0, H: 0, V: 0, O: 0, Y: 0, G: 0, present: 0, accounted: 0 };
  list.forEach((s) => {
    const r = isRes(s);
    if (r) c.res++; else c.day++;
    const st = statuses[s.id];
    if (!st) { c.present++; r ? c.resP++ : c.dayP++; }
    else if (st === "A") { r ? c.resA++ : c.dayA++; }
    else { c[st] = (c[st] || 0) + 1; c.accounted++; }
  });
  return c;
}

function carriedStatuses(duty, duties, records, students) {
  // Spanning-type entries (Home/Sick/Outing/Gita Nagari) marked at any earlier checkpoint today
  // carry forward automatically until the child is marked Present or the office clears them.
  const carry = {};
  const done = duties.filter((x) => records[x.id]).sort((a, b) => records[a.id].at - records[b.id].at);
  const pops = done.map((x) => new Set(popStudents(x.pop, students).map((y) => y.id)));
  popStudents(duty.pop, students).forEach((s) => {
    done.forEach((x, i) => {
      if (!pops[i].has(s.id)) return;
      const st = records[x.id].statuses[s.id];
      if (st && SPANNING.includes(st)) carry[s.id] = st;
      else delete carry[s.id]; // Present or Absent at a later checkpoint ends the carry
    });
  });
  return carry;
}

// ---------- App ----------
export default function App() {
  const [view, setView] = useState("teacher");
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [teachers, setTeachers] = useState(INITIAL_TEACHERS);
  const [duties, setDuties] = useState(INITIAL_DUTIES);
  const [records, setRecords] = useState(SEED_RECORDS);
  const [activeTeacher, setActiveTeacher] = useState(slug("Krishna Saha Mt"));
  const [openDuty, setOpenDuty] = useState(null);
  const [pendingStatuses, setPendingStatuses] = useState({});
  const [toast, setToast] = useState(null);
  const [enabledStatuses, setEnabledStatuses] = useState(Object.keys(STATUS_META));

  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "—";
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 4500); };
  const addCustomStatus = (label) => {
    const code = "C" + Object.keys(STATUS_META).length;
    STATUS_META[code] = { label, cls: "bg-cyan-700 text-white", accounted: true };
    setEnabledStatuses((e) => [...e, code]);
    showToast(`Entry type "${label}" added — available in marking menus now, counted as accounted-elsewhere in reports.`);
  };

  const submit = (duty) => {
    setRecords((r) => ({ ...r, [duty.id]: { statuses: pendingStatuses, markedBy: activeTeacher, at: NOW } }));
    const list = popStudents(duty.pop, students);
    const c = summarize(list, pendingStatuses);
    const spans = Object.values(pendingStatuses).filter((v) => SPANNING.includes(v)).length;
    showToast(`${duty.checkpoint} · ${duty.groupLabel}: ${c.present}/${list.length} present, ${c.accounted} accounted elsewhere, ${c.resA + c.dayA} absent. Summary sent to Coordinator, MOD & Principal.${spans ? ` ${spans} Home/Sick/Outing/Gita Nagari entr${spans > 1 ? "ies" : "y"} will carry forward to later checkpoints, and the office has been asked to confirm and clear on return.` : ""}`);
    setOpenDuty(null); setPendingStatuses({});
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="bg-emerald-900 text-white">
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Bhaktivedanta Gurukula and International School</h1>
              <p className="text-emerald-200 text-xs mt-0.5">Attendance & student safety · {students.length} students · Friday · {fmt(NOW)}</p>
            </div>
            <span className="text-emerald-200 text-xs shrink-0">Prototype</span>
          </div>
          <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
            {[["teacher", "Teacher app"], ["admin", "Duty roster"], ["mgmt", "Management"], ["data", "Students & staff"]].map(([k, label]) => (
              <button key={k} onClick={() => { setView(k); setOpenDuty(null); }}
                className={`px-3.5 py-2 text-sm rounded-t-lg whitespace-nowrap ${view === k ? "bg-stone-100 text-emerald-900 font-medium" : "text-emerald-100 hover:bg-emerald-800"}`}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {toast && (
        <div className="max-w-4xl mx-auto px-4 pt-3">
          <div className="bg-emerald-800 text-white text-sm rounded-lg px-4 py-3">{toast}</div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-5">
        {view === "teacher" && (
          <TeacherView duties={duties} records={records} students={students} teachers={teachers} enabledStatuses={enabledStatuses}
            activeTeacher={activeTeacher} setActiveTeacher={setActiveTeacher}
            openDuty={openDuty} setOpenDuty={(d) => { setOpenDuty(d); setPendingStatuses(d && !d.readOnly ? carriedStatuses(d, duties, records, students) : {}); }}
            pendingStatuses={pendingStatuses} setPendingStatuses={setPendingStatuses} submit={submit} />
        )}
        {view === "admin" && <RosterView duties={duties} setDuties={setDuties} records={records} teachers={teachers} students={students} />}
        {view === "mgmt" && <MgmtView duties={duties} records={records} students={students} teacherName={teacherName} />}
        {view === "data" && <DataView students={students} setStudents={setStudents} teachers={teachers} setTeachers={setTeachers} duties={duties} setDuties={setDuties} records={records} enabledStatuses={enabledStatuses} setEnabledStatuses={setEnabledStatuses} addCustomStatus={addCustomStatus} showToast={showToast} />}
      </main>
    </div>
  );
}

// ---------- Teacher view ----------
function TeacherView({ duties, records, students, teachers, enabledStatuses, activeTeacher, setActiveTeacher, openDuty, setOpenDuty, pendingStatuses, setPendingStatuses, submit }) {
  const mine = duties.filter((d) => d.teacherId === activeTeacher);

  if (openDuty) {
    const list = popStudents(openDuty.pop, students);
    const byClass = {};
    list.forEach((s) => { (byClass[s.label] = byClass[s.label] || []).push(s); });
    const ro = !!openDuty.readOnly;
    const rec = records[openDuty.id];
    const statuses = ro ? (rec ? rec.statuses : {}) : pendingStatuses;
    const c = summarize(list, statuses);
    return (
      <div className="max-w-md mx-auto">
        <button onClick={() => setOpenDuty(null)} className="text-sm text-emerald-800 mb-3">&larr; Back to my duties</button>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-200">
            <h2 className="font-semibold">{openDuty.checkpoint} · {openDuty.groupLabel}</h2>
            <p className="text-xs text-stone-500 mt-0.5">{ro
              ? `Read-only cross-check · ${list.length} students · submitted at ${fmt(rec.at)}. Entries are locked — corrections go through the Coordinator.`
              : `${list.length} students · window ${fmt(openDuty.start)}–${fmt(openDuty.end)}. Everyone starts as Present — tap a name for Absent, or use the menu for the rest. Pre-filled entries were carried forward from earlier checkpoints and stay until the office clears them on return.`}</p>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
            {Object.entries(byClass).map(([cls, ss]) => (
              <div key={cls}>
                {Object.keys(byClass).length > 1 && <div className="px-4 py-1.5 bg-stone-50 text-xs font-medium text-stone-500 sticky top-0">Class {cls}</div>}
                {ss.map((s) => {
                  const st = statuses[s.id];
                  return (
                    <div key={s.id} className={`flex items-center justify-between px-4 py-2 gap-2 ${st === "A" ? "bg-red-50" : st ? "bg-amber-50" : "bg-white"}`}>
                      <button className="flex-1 text-left text-sm" disabled={ro}
                        onClick={() => !ro && setPendingStatuses((p) => { const n = { ...p }; if (n[s.id] === "A") delete n[s.id]; else n[s.id] = "A"; return n; })}>
                        <span className={st === "A" ? "text-red-700 font-medium" : ""}>{s.name}</span>
                        <span className="text-stone-400 text-xs ml-2">{s.label} · Roll {s.roll} · {s.type === "D" ? "Day" : "Res"}</span>
                      </button>
                      <select value={st || "P"} disabled={ro} onChange={(e) => setPendingStatuses((p) => { const n = { ...p }; if (e.target.value === "P") delete n[s.id]; else n[s.id] = e.target.value; return n; })}
                        className={`text-xs rounded-full px-2 py-1 border-0 ${st ? STATUS_META[st].cls : "bg-emerald-100 text-emerald-800"}`}>
                        <option value="P">Present</option>
                        {Object.entries(STATUS_META).filter(([k]) => enabledStatuses.includes(k)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-2">
            <span className="text-xs text-stone-600">Present {c.present} · Absent {c.resA + c.dayA}{Object.keys(STATUS_META).filter((k) => k !== "A" && c[k]).map((k) => ` · ${STATUS_META[k].label} ${c[k]}`).join("")}</span>
            {ro
              ? <span className="text-xs text-stone-500 shrink-0">Locked · marked by {(teachers.find((t) => t.id === rec.markedBy) || {}).name || "—"}</span>
              : <button onClick={() => submit(openDuty)} className="bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium shrink-0">Submit</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <label className="text-xs text-stone-500">Signed in as</label>
      <select value={activeTeacher} onChange={(e) => setActiveTeacher(e.target.value)}
        className="w-full mt-1 mb-4 bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm">
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.role}</option>)}
      </select>
      <h2 className="font-semibold mb-2">My duties today</h2>
      {mine.length === 0 && <div className="bg-white border border-stone-200 rounded-xl p-6 text-sm text-stone-500 text-center">No attendance duties assigned to you today.</div>}
      <div className="space-y-2">
        {mine.map((d) => {
          const st = dutyStatus(d, records);
          const rec = records[d.id];
          const c = rec ? summarize(popStudents(d.pop, students), rec.statuses) : null;
          return (
            <div key={d.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{d.checkpoint} · {d.groupLabel}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{fmt(d.start)}–{fmt(d.end)}{rec && ` · submitted ${fmt(rec.at)} · ${c.present} present`}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
              </div>
              {st === "due" && <div className="mt-2 bg-amber-50 text-amber-900 text-xs rounded-lg px-3 py-2">Reminder: due by {fmt(d.end)}. Escalates to Ashram Coordinator and MOD if missed.</div>}
              {st === "overdue" && <div className="mt-2 bg-red-50 text-red-800 text-xs rounded-lg px-3 py-2">Overdue — escalated at {fmt(d.end)}. Please mark now.</div>}
              {(st === "due" || st === "overdue") && (
                <button onClick={() => setOpenDuty(d)} className="mt-2 w-full bg-emerald-800 text-white text-sm py-2 rounded-lg font-medium">Mark attendance</button>
              )}
              {st === "done" && (
                <button onClick={() => setOpenDuty({ ...d, readOnly: true })} className="mt-2 w-full border border-emerald-800 text-emerald-800 text-sm py-2 rounded-lg font-medium">View entries to cross-check</button>
              )}
            </div>
          );
        })}
      </div>
      <MyClassDay activeTeacher={activeTeacher} duties={duties} records={records} students={students} />
      <p className="text-xs text-stone-400 mt-4">Tip: Krishna Saha Mt has Class 4 A morning attendance due now. Switch to Ajay Solanki Pr to see the overdue senior breakfast with escalation.</p>
    </div>
  );
}

// ---------- Roster view ----------
function RosterView({ duties, setDuties, records, teachers, students }) {
  const reassign = (id, teacherId) => setDuties((ds) => ds.map((d) => (d.id === id ? { ...d, teacherId } : d)));
  const setScope = (id, scope) => setDuties((ds) => ds.map((d) => (d.id === id ? { ...d, pop: { ...d.pop, resOnly: undefined, scope } } : d)));
  const groups = [];
  duties.forEach((d) => {
    let g = groups.find((x) => x.name === d.checkpoint);
    if (!g) { g = { name: d.checkpoint, items: [] }; groups.push(g); }
    g.items.push(d);
  });
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-semibold">Duty roster — today</h2>
        <span className="text-xs text-stone-500">Coordinator access</span>
      </div>
      <p className="text-sm text-stone-600 mb-4">Any checkpoint can be assigned to any teacher, over any student group (class-section, grade band, or custom list) with a scope of all students, residential only, or day scholars only. Changing a name is a one-day override; reminders follow whoever is assigned.</p>
      <div className="space-y-3">
        {groups.map((g) => {
          const pend = g.items.some((d) => ["due", "overdue"].includes(dutyStatus(d, records)));
          const doneN = g.items.filter((d) => records[d.id]).length;
          return (
            <details key={g.name} open={pend} className="bg-white border border-stone-200 rounded-xl">
              <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-sm">
                <span className="font-medium">{g.name} <span className="text-stone-400 font-normal">· {g.items.length} group{g.items.length > 1 ? "s" : ""}</span></span>
                <span className="text-xs text-stone-500">{doneN}/{g.items.length} submitted · {fmt(g.items[0].start)}–{fmt(g.items[0].end)}</span>
              </summary>
              <div className="divide-y divide-stone-100 border-t border-stone-100">
                {g.items.map((d) => {
                  const st = dutyStatus(d, records);
                  const n = popStudents(d.pop, students).length;
                  return (
                    <div key={d.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm">
                      <span className="col-span-2 sm:col-span-4">{d.groupLabel} <span className="text-stone-400 text-xs">· {n} students</span></span>
                      <span className="col-span-1 sm:col-span-3">
                        {(d.pop.kind === "band" || d.pop.kind === "remedial") ? (
                          <select value={scopeOf(d.pop)} onChange={(e) => setScope(d.id, e.target.value)} disabled={st === "done"}
                            className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white disabled:bg-stone-100 disabled:text-stone-400">
                            {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-stone-400">{SCOPE_LABEL[scopeOf(d.pop)]}</span>
                        )}
                      </span>
                      <span className="col-span-1 sm:col-span-3">
                        <select value={d.teacherId} onChange={(e) => reassign(d.id, e.target.value)} disabled={st === "done"}
                          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white disabled:bg-stone-100 disabled:text-stone-400">
                          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </span>
                      <span className="col-span-1 sm:col-span-2 sm:text-right">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
      <p className="text-xs text-stone-400 mt-3">In the full app: weekly default rosters, rotation for prasadam and ashram duty, substitute handover, Saturday/Sunday schedules, and backup marking rights.</p>
    </div>
  );
}

// ---------- Management view ----------
function MgmtView({ duties, records, students, teacherName }) {
  const overdue = duties.filter((d) => dutyStatus(d, records) === "overdue");
  const done = duties.filter((d) => records[d.id]);

  const alerts = useMemo(() => {
    const out = [];
    const ordered = [...done].sort((a, b) => records[a.id].at - records[b.id].at);
    ordered.forEach((d) => {
      Object.entries(records[d.id].statuses).forEach(([sid, code]) => {
        if (code !== "A") return;
        const s = students.find((x) => x.id === sid);
        if (!s) return;
        const earlier = ordered.find((e) => e.end < d.start && popStudents(e.pop, students).some((x) => x.id === sid) && !records[e.id].statuses[sid]);
        if (earlier) out.push({ s, was: earlier, now: d });
      });
    });
    return out;
  }, [done, records, students]);

  const groups = [];
  duties.forEach((d) => {
    let g = groups.find((x) => x.name === d.checkpoint);
    if (!g) { g = { name: d.checkpoint, items: [] }; groups.push(g); }
    g.items.push(d);
  });

  const attention = students.filter((s) => s.remedial).slice(0, 6).map((s, i) => ({ s, remedial: [55, 62, 64, 70, 72, 78][i], study: [62, 70, 58, 66, 75, 69][i], meals: [96, 98, 92, 99, 95, 97][i] }));

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-red-800">Attendance overdue</p>
          {overdue.map((d) => (
            <p key={d.id} className="text-sm text-red-700 mt-1">{d.checkpoint} · {d.groupLabel} — {teacherName(d.teacherId)} has not submitted (due {fmt(d.end)}). Reminder sent; escalated to Ashram Coordinator & MOD.</p>
          ))}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-amber-900">Safety check — account for these students</p>
          {alerts.map((a, i) => (
            <p key={i} className="text-sm text-amber-900 mt-1">{a.s.name} (Class {a.s.label}, Roll {a.s.roll}, {a.s.house} house) — present at {a.was.checkpoint.toLowerCase()}, absent at {a.now.checkpoint.toLowerCase()}.</p>
          ))}
        </div>
      )}

      <section>
        <h2 className="font-semibold mb-2">Today's checkpoints</h2>
        <div className="space-y-3">
          {groups.map((g) => {
            const doneN = g.items.filter((d) => records[d.id]).length;
            const allSt = g.items.map((d) => dutyStatus(d, records));
            const chip = allSt.includes("overdue") ? "overdue" : allSt.includes("due") ? "due" : doneN === g.items.length ? "done" : "upcoming";
            let present = 0, total = 0;
            g.items.forEach((d) => { if (records[d.id]) { const l = popStudents(d.pop, students); total += l.length; present += summarize(l, records[d.id].statuses).present; } });
            return (
              <details key={g.name} className="bg-white border border-stone-200 rounded-xl" open={chip === "overdue"}>
                <summary className="px-4 py-3 cursor-pointer flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{g.name}
                    <span className="text-stone-400 font-normal"> · {doneN}/{g.items.length} submitted{total > 0 && ` · ${present}/${total} present so far`}</span>
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${STATUS_STYLE[chip]}`}>{STATUS_LABEL[chip]}</span>
                </summary>
                <div className="border-t border-stone-100 px-4 py-3 space-y-3">
                  {g.items.map((d) => <DutyReport key={d.id} duty={d} rec={records[d.id]} students={students} teacherName={teacherName} />)}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-1">Needs special attention</h2>
        <p className="text-xs text-stone-500 mb-2">Students below 80% in remedial or self study over the last 14 days — auto-generated every Monday. (Sample percentages for demo.)</p>
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 bg-stone-50 text-xs font-medium text-stone-500 border-b border-stone-200">
            <span className="col-span-6">Student</span><span className="col-span-2 text-right">Remedial</span><span className="col-span-2 text-right">Self study</span><span className="col-span-2 text-right">Prasadam</span>
          </div>
          <div className="divide-y divide-stone-100">
            {attention.map((a, i) => (
              <div key={i} className="grid grid-cols-12 px-4 py-2.5 text-sm items-center">
                <span className="col-span-6">{a.s.name} <span className="text-stone-400 text-xs">· {a.s.label} · Roll {a.s.roll}</span></span>
                <span className={`col-span-2 text-right ${a.remedial < 70 ? "text-red-600 font-medium" : "text-amber-700"}`}>{a.remedial}%</span>
                <span className={`col-span-2 text-right ${a.study < 70 ? "text-red-600 font-medium" : "text-amber-700"}`}>{a.study}%</span>
                <span className="col-span-2 text-right text-stone-600">{a.meals}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function DutyReport({ duty, rec, students, teacherName }) {
  const list = popStudents(duty.pop, students);
  if (!rec) {
    return <p className="text-xs text-stone-500">{duty.groupLabel} — {teacherName(duty.teacherId)} · window {fmt(duty.start)}–{fmt(duty.end)} · {list.length} students · <span className={NOW > duty.end ? "text-red-600 font-medium" : ""}>{NOW > duty.end ? "not submitted" : "pending"}</span></p>;
  }
  const byClass = {};
  list.forEach((s) => { (byClass[s.label] = byClass[s.label] || []).push(s); });
  const sc = scopeOf(duty.pop);
  const showDay = sc !== "res";
  const showRes = sc !== "day";
  const rows = Object.entries(byClass).map(([cls, ss]) => ({ cls, c: summarize(ss, rec.statuses) }));
  const tot = summarize(list, rec.statuses);
  const absentNames = list.filter((s) => rec.statuses[s.id] === "A");
  const byBand = { Primary: [], Middle: [], Senior: [] };
  absentNames.forEach((s) => byBand[bandOf(s.grade)].push(s));
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-stone-50 text-xs flex items-center justify-between">
        <span className="font-medium">{duty.groupLabel}</span>
        <span className="text-stone-500">marked by {teacherName(rec.markedBy)} at {fmt(rec.at)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-stone-500 border-b border-stone-100">
            <th className="text-left px-3 py-1.5 font-medium">Class</th>
            {showRes && <th className="text-right px-2 py-1.5 font-medium">Res</th>}
            {showDay && <th className="text-right px-2 py-1.5 font-medium">Day</th>}
            <th className="text-right px-2 py-1.5 font-medium">Total</th>
            {showRes && <th className="text-right px-2 py-1.5 font-medium">Res P</th>}
            {showDay && <th className="text-right px-2 py-1.5 font-medium">Day P</th>}
            {showRes && <th className="text-right px-2 py-1.5 font-medium">Res A</th>}
            {showDay && <th className="text-right px-2 py-1.5 font-medium">Day A</th>}
            <th className="text-right px-2 py-1.5 font-medium">Home</th>
            <th className="text-right px-2 py-1.5 font-medium">Sick</th>
            <th className="text-right px-2 py-1.5 font-medium">Elsewhere</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cls} className="border-b border-stone-50">
                <td className="px-3 py-1">{r.cls}</td>
                {showRes && <td className="text-right px-2 py-1">{r.c.res}</td>}
                {showDay && <td className="text-right px-2 py-1">{r.c.day}</td>}
                <td className="text-right px-2 py-1">{r.c.res + r.c.day}</td>
                {showRes && <td className="text-right px-2 py-1">{r.c.resP}</td>}
                {showDay && <td className="text-right px-2 py-1">{r.c.dayP}</td>}
                {showRes && <td className={`text-right px-2 py-1 ${r.c.resA ? "text-red-600 font-medium" : ""}`}>{r.c.resA}</td>}
                {showDay && <td className={`text-right px-2 py-1 ${r.c.dayA ? "text-red-600 font-medium" : ""}`}>{r.c.dayA}</td>}
                <td className="text-right px-2 py-1">{r.c.H || 0}</td>
                <td className="text-right px-2 py-1">{r.c.S || 0}</td>
                <td className="text-right px-2 py-1">{(r.c.accounted || 0) - (r.c.H || 0) - (r.c.S || 0)}</td>
              </tr>
            ))}
            <tr className="font-medium bg-stone-50">
              <td className="px-3 py-1">Total</td>
              {showRes && <td className="text-right px-2 py-1">{tot.res}</td>}
              {showDay && <td className="text-right px-2 py-1">{tot.day}</td>}
              <td className="text-right px-2 py-1">{tot.res + tot.day}</td>
              {showRes && <td className="text-right px-2 py-1">{tot.resP}</td>}
              {showDay && <td className="text-right px-2 py-1">{tot.dayP}</td>}
              {showRes && <td className="text-right px-2 py-1">{tot.resA}</td>}
              {showDay && <td className="text-right px-2 py-1">{tot.dayA}</td>}
              <td className="text-right px-2 py-1">{tot.H || 0}</td>
              <td className="text-right px-2 py-1">{tot.S || 0}</td>
              <td className="text-right px-2 py-1">{(tot.accounted || 0) - (tot.H || 0) - (tot.S || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {absentNames.length > 0 && (
        <div className="px-3 py-2 text-xs text-stone-600 border-t border-stone-100">
          {["Primary", "Middle", "Senior"].filter((b) => byBand[b].length).map((b) => (
            <p key={b}><span className="font-medium">Absent {b}:</span> {byBand[b].map((s) => `${s.name} (${s.label})`).join(", ")}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Students & staff (admin data management) ----------
function DataView({ students, setStudents, teachers, setTeachers, duties, setDuties, records, enabledStatuses, setEnabledStatuses, addCustomStatus, showToast }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("list");
  const [confirmDel, setConfirmDel] = useState(null);
  const removeStudent = (s) => {
    setStudents((ss) => ss.filter((x) => x.id !== s.id));
    setConfirmDel(null);
    showToast(`${s.name} (${s.adm}) removed from Class ${s.label}. They will no longer appear in any attendance list. Past attendance records are kept for reports.`);
  };
  const filtered = students.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.adm.toLowerCase().includes(q.toLowerCase()) || s.label.toLowerCase().includes(q.toLowerCase()));
  const res = students.filter(isRes).length;
  const unassigned = students.filter((s) => s.house === "Assign" || !s.house).length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[[students.length, "Students"], [res, "Residential"], [students.length - res, "Day scholars"], [unassigned, "House not assigned"]].map(([n, l], i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-xl px-4 py-3">
            <p className={`text-xl font-semibold ${l === "House not assigned" && n > 0 ? "text-amber-600" : ""}`}>{n}</p>
            <p className="text-xs text-stone-500">{l}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-3">
        {[["list", "Student list"], ["add", "Add student"], ["import", "Import CSV / Excel"], ["staff", "Teachers & staff"], ["statuses", "Attendance entries"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 text-sm rounded-lg ${tab === k ? "bg-emerald-800 text-white" : "bg-white border border-stone-300 text-stone-700"}`}>{l}</button>
        ))}
      </div>

      {tab === "list" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-stone-200">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, admission no., or class (e.g. 7 K)"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-stone-500 bg-stone-50 border-b border-stone-200">
                <th className="text-left px-4 py-2 font-medium">Admission No.</th><th className="text-left px-2 py-2 font-medium">Name</th>
                <th className="text-left px-2 py-2 font-medium">Class</th><th className="text-left px-2 py-2 font-medium">Type</th>
                <th className="text-left px-2 py-2 font-medium">House</th><th className="text-right px-2 py-2 font-medium">Roll</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.slice(0, 40).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-xs text-stone-500">{s.adm}</td>
                    <td className="px-2 py-2">{s.name}</td>
                    <td className="px-2 py-2">{s.label}</td>
                    <td className="px-2 py-2 text-xs">{{ R: "Residential", D: "Day scholar", V: "Vedic", B: "Day boarding" }[s.type]}</td>
                    <td className="px-2 py-2 text-xs">{s.house === "Assign" ? <span className="text-amber-600">Not assigned</span> : s.house}</td>
                    <td className="px-2 py-2 text-right text-xs">{s.roll}</td>
                    <td className="px-4 py-2 text-right">
                      {confirmDel === s.id ? (
                        <span className="text-xs whitespace-nowrap">
                          <button onClick={() => removeStudent(s)} className="text-red-600 font-medium mr-2">Confirm</button>
                          <button onClick={() => setConfirmDel(null)} className="text-stone-500">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDel(s.id)} className="text-xs text-red-600">Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 40 && <p className="px-4 py-2 text-xs text-stone-400 border-t border-stone-100">Showing 40 of {filtered.length} — refine the search to narrow down.</p>}
          <p className="px-4 py-2 text-xs text-stone-400 border-t border-stone-100">Removing a student takes them out of every future attendance list. In the full app this is a "deactivate" with a leaving date — history stays intact for reports, and the record can be restored if the student returns.</p>
        </div>
      )}

      {tab === "add" && <AddStudent students={students} setStudents={setStudents} showToast={showToast} />}
      {tab === "import" && <ImportPanel students={students} setStudents={setStudents} showToast={showToast} />}
      {tab === "staff" && <StaffPanel teachers={teachers} setTeachers={setTeachers} duties={duties} setDuties={setDuties} records={records} showToast={showToast} />}
      {tab === "statuses" && <StatusesPanel enabledStatuses={enabledStatuses} setEnabledStatuses={setEnabledStatuses} addCustomStatus={addCustomStatus} />}
    </div>
  );
}

function AddStudent({ students, setStudents, showToast }) {
  const [f, setF] = useState({ adm: "", name: "", key: SECTIONS[0].key, type: "R", house: "Assign", roll: "" });
  const [err, setErr] = useState(null);
  const save = () => {
    if (!f.adm.trim() || !f.name.trim()) return setErr("Admission number and name are required.");
    if (students.some((s) => s.adm.toLowerCase() === f.adm.trim().toLowerCase())) return setErr(`Admission number ${f.adm} already exists (${students.find((s) => s.adm.toLowerCase() === f.adm.trim().toLowerCase()).name}).`);
    const [g, sec] = f.key.split("|");
    setStudents((ss) => [...ss, { id: f.adm.trim(), adm: f.adm.trim(), name: f.name.trim(), grade: +g, sec, key: f.key, label: labelOf(+g, sec), type: f.type, house: f.house, roll: +f.roll || 0, remedial: false }]);
    showToast(`${f.name.trim()} added to Class ${labelOf(+g, sec)}. They will appear in all matching attendance groups from the next checkpoint.`);
    setF({ adm: "", name: "", key: SECTIONS[0].key, type: "R", house: "Assign", roll: "" }); setErr(null);
  };
  const inp = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white";
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 max-w-md">
      <h3 className="font-semibold text-sm mb-3">Add a student</h3>
      <div className="space-y-2.5">
        <div><label className="text-xs text-stone-500">Admission No.</label><input className={inp} value={f.adm} onChange={(e) => setF({ ...f, adm: e.target.value })} placeholder="e.g. S2607001" /></div>
        <div><label className="text-xs text-stone-500">Student name</label><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-stone-500">Class & section</label>
            <select className={inp} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })}>{SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div><label className="text-xs text-stone-500">Student type</label>
            <select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="R">Residential</option><option value="D">Day scholar</option><option value="V">Vedic school</option><option value="B">Day boarding</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-stone-500">House</label>
            <select className={inp} value={f.house} onChange={(e) => setF({ ...f, house: e.target.value })}>
              {["Assign", "GOVARDHAN", "VRINDAVAN", "NANDGAON", "BARSANA"].map((h) => <option key={h}>{h}</option>)}</select></div>
          <div><label className="text-xs text-stone-500">Roll No.</label><input className={inp} value={f.roll} onChange={(e) => setF({ ...f, roll: e.target.value })} /></div>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button onClick={save} className="bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium">Add student</button>
      </div>
    </div>
  );
}

function ImportPanel({ students, setStudents, showToast }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");

  const validate = (raw) => {
    const seen = new Set();
    return raw.map((r, i) => {
      const adm = String(r["Admission No."] ?? r["Admission No"] ?? "").trim();
      const name = String(r["Student Name"] ?? "").trim();
      const cls = String(r["Class Name"] ?? "").replace(/\.0$/, "").trim();
      const sec = String(r["Section Name"] ?? "").trim();
      const type = String(r["Student Type"] ?? "").trim().toUpperCase();
      const house = String(r["House"] ?? "Assign").trim();
      const roll = parseInt(r["Roll No"] ?? 0) || 0;
      const errors = [], warnings = [];
      if (!adm) errors.push("missing Admission No.");
      if (!name) errors.push("missing Student Name");
      const key = keyOf(+cls, sec);
      if (!SECTION_KEYS.includes(key)) errors.push(`unknown class-section "${cls} ${sec}"`);
      if (adm && students.some((s) => s.adm.toLowerCase() === adm.toLowerCase())) errors.push("Admission No. already in system");
      if (adm && seen.has(adm.toLowerCase())) errors.push("duplicate Admission No. within file");
      seen.add(adm.toLowerCase());
      const tmap = { RESIDENTIAL: "R", "DAY SCHOLAR": "D", "VEDIC SCHOOL": "V", "DAY BOARDING": "B" };
      let t = tmap[type];
      if (!t) { t = "D"; warnings.push(`unknown type "${type}" → set to Day scholar`); }
      if (!house || house === "Assign") warnings.push("house not assigned");
      return { i: i + 2, adm, name, cls, sec, key, type: t, house: house || "Assign", roll, errors, warnings };
    });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames.includes("List") ? "List" : wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        setRows(validate(raw));
      } catch (err) {
        showToast("Could not read the file — please upload a .csv or .xlsx with the standard columns.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const importValid = () => {
    const valid = rows.filter((r) => r.errors.length === 0);
    setStudents((ss) => [...ss, ...valid.map((r) => ({ id: r.adm, adm: r.adm, name: r.name, grade: +r.cls, sec: r.sec, key: r.key, label: labelOf(+r.cls, r.sec), type: r.type, house: r.house, roll: r.roll, remedial: false }))]);
    showToast(`${valid.length} students imported. ${rows.length - valid.length} rows skipped due to errors.`);
    setRows(null);
  };

  const template = () => {
    const csv = "Sr No.,Admission No.,Class Name,Section Name,Student Name,Student Type,Year of Joining,Old / New,House,Roll No\n1,S2607001,7,KRISHNA,Example Student,RESIDENTIAL,2026,New,GOVARDHAN,701\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "student_import_template.csv"; a.click();
  };

  const errCount = rows ? rows.filter((r) => r.errors.length).length : 0;
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <h3 className="font-semibold text-sm">Bulk import from CSV or Excel</h3>
      <p className="text-xs text-stone-500 mt-1 mb-3">Uses your existing register format — the same columns as Student_List_2025-26.xlsx (Admission No., Class Name, Section Name, Student Name, Student Type, House, Roll No). Rows are validated before anything is saved.</p>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium cursor-pointer">
          Choose file<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
        </label>
        <button onClick={template} className="text-sm px-4 py-2 rounded-lg border border-stone-300">Download template</button>
        {fileName && <span className="text-xs text-stone-500">{fileName}</span>}
      </div>

      {rows && (
        <div className="mt-4">
          <p className="text-sm mb-2">
            <span className="text-emerald-700 font-medium">{rows.length - errCount} rows ready to import</span>
            {errCount > 0 && <span className="text-red-600"> · {errCount} rows with errors (will be skipped)</span>}
          </p>
          <div className="border border-stone-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 sticky top-0"><tr className="text-stone-500">
                <th className="text-left px-3 py-1.5 font-medium">Row</th><th className="text-left px-2 py-1.5 font-medium">Admission</th>
                <th className="text-left px-2 py-1.5 font-medium">Name</th><th className="text-left px-2 py-1.5 font-medium">Class</th>
                <th className="text-left px-2 py-1.5 font-medium">Result</th>
              </tr></thead>
              <tbody className="divide-y divide-stone-100">
                {rows.slice(0, 25).map((r) => (
                  <tr key={r.i} className={r.errors.length ? "bg-red-50" : ""}>
                    <td className="px-3 py-1.5 text-stone-400">{r.i}</td>
                    <td className="px-2 py-1.5">{r.adm || "—"}</td>
                    <td className="px-2 py-1.5">{r.name || "—"}</td>
                    <td className="px-2 py-1.5">{r.cls} {secShort(r.sec)}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length ? <span className="text-red-600">{r.errors.join("; ")}</span>
                        : r.warnings.length ? <span className="text-amber-600">OK · {r.warnings.join("; ")}</span>
                          : <span className="text-emerald-700">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 25 && <p className="text-xs text-stone-400 mt-1">Showing first 25 of {rows.length} rows.</p>}
          <button onClick={importValid} disabled={rows.length - errCount === 0}
            className="mt-3 bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40">
            Import {rows.length - errCount} valid rows
          </button>
        </div>
      )}
      <p className="text-xs text-stone-400 mt-3">Try it: upload your own Student_List_2025-26.xlsx — every row will be flagged "already in system", proving the duplicate check. A file with new admission numbers imports cleanly.</p>
    </div>
  );
}

function StaffPanel({ teachers, setTeachers, duties, setDuties, records, showToast }) {
  const [f, setF] = useState({ name: "", role: "Class teacher" });
  const [confirmDel, setConfirmDel] = useState(null);
  const openDuties = (id) => duties.filter((d) => d.teacherId === id && !records[d.id]);
  const removeTeacher = (t) => {
    const pending = openDuties(t.id);
    const coord = teachers.find((x) => x.id === slug("Ashram Coordinator")) || teachers[0];
    if (pending.length) setDuties((ds) => ds.map((d) => (d.teacherId === t.id && !records[d.id] ? { ...d, teacherId: coord.id } : d)));
    setTeachers((ts) => ts.filter((x) => x.id !== t.id));
    setConfirmDel(null);
    showToast(`${t.name} removed from staff.${pending.length ? ` ${pending.length} pending dut${pending.length > 1 ? "ies" : "y"} reassigned to ${coord.name} — please review the roster.` : ""} Past records keep their name for accountability.`);
  };
  const add = () => {
    if (!f.name.trim()) return;
    if (teachers.some((t) => t.name.toLowerCase() === f.name.trim().toLowerCase())) return showToast(`${f.name.trim()} is already in the staff list.`);
    setTeachers((ts) => [...ts, { id: slug(f.name.trim()) + "-" + ts.length, name: f.name.trim(), role: f.role }]);
    showToast(`${f.name.trim()} added — they can now be assigned duties in the roster and will receive reminders.`);
    setF({ name: "", role: "Class teacher" });
  };
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-3">Add teacher / staff</h3>
        <div className="space-y-2.5">
          <input className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" placeholder="Name (e.g. Radha Priya Mt)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {["Class teacher", "Ashram teacher", "Duty staff", "Sports teacher", "Coordinator"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <button onClick={add} className="bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium">Add to staff</button>
        </div>
        <p className="text-xs text-stone-400 mt-3">In the full app, staff CSV import works the same way as students, and each teacher gets a login linked to their phone for reminders.</p>
      </div>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 text-xs font-medium text-stone-500 border-b border-stone-200">Staff list · {teachers.length}</div>
        <div className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
          {teachers.map((t) => (
            <div key={t.id} className="px-4 py-2 flex items-center justify-between gap-2 text-sm">
              <span>{t.name} <span className="text-xs text-stone-400">· {t.role}</span>
                {openDuties(t.id).length > 0 && <span className="text-xs text-amber-600"> · {openDuties(t.id).length} pending dut{openDuties(t.id).length > 1 ? "ies" : "y"} today</span>}
              </span>
              {confirmDel === t.id ? (
                <span className="text-xs whitespace-nowrap shrink-0">
                  <button onClick={() => removeTeacher(t)} className="text-red-600 font-medium mr-2">Confirm</button>
                  <button onClick={() => setConfirmDel(null)} className="text-stone-500">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDel(t.id)} className="text-xs text-red-600 shrink-0">Remove</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MyClassDay({ activeTeacher, duties, records, students }) {
  const myKeys = Object.entries(CLASS_TEACHERS).filter(([, n]) => slug(n) === activeTeacher).map(([k]) => k);
  if (!myKeys.length) return null;
  const key = myKeys[0];
  const [g, sec] = key.split("|");
  const myStudents = students.filter((s) => s.key === key);
  const doneDuties = duties.filter((d) => records[d.id]).sort((a, b) => a.start - b.start);
  const rows = myStudents.map((s) => {
    const marks = doneDuties
      .filter((d) => popStudents(d.pop, students).some((x) => x.id === s.id))
      .map((d) => ({ cp: d.checkpoint, st: records[d.id].statuses[s.id] }));
    return { s, marks };
  });
  const flagged = rows.filter((r) => r.marks.some((m) => m.st));
  return (
    <details className="mt-4 bg-white border border-stone-200 rounded-xl">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium">My class today — {labelOf(+g, sec)} <span className="text-stone-400 font-normal">· cross-check across all checkpoints</span></summary>
      <div className="border-t border-stone-100 px-4 py-3">
        {flagged.length === 0 ? (
          <p className="text-xs text-stone-500">All {myStudents.length} students of your class are marked Present at every checkpoint submitted so far ({doneDuties.filter((d) => popStudents(d.pop, students).some((x) => x.key === key)).map((d) => d.checkpoint).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "none yet"}).</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-stone-500 mb-1">{flagged.length} of your {myStudents.length} students have a non-Present entry today, marked by other duty teachers:</p>
            {flagged.map((r) => (
              <p key={r.s.id} className="text-sm">
                {r.s.name} <span className="text-stone-400 text-xs">Roll {r.s.roll}</span> —{" "}
                {r.marks.filter((m) => m.st).map((m, i) => (
                  <span key={i} className="text-xs mr-1"><span className={`px-1.5 py-0.5 rounded-full ${STATUS_META[m.st].cls}`}>{STATUS_META[m.st].label}</span> at {m.cp.toLowerCase()}{i < r.marks.filter((x) => x.st).length - 1 ? "," : ""} </span>
                ))}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function StatusesPanel({ enabledStatuses, setEnabledStatuses, addCustomStatus }) {
  const [name, setName] = useState("");
  const toggle = (k) => setEnabledStatuses((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-1">Attendance entry types</h3>
        <p className="text-xs text-stone-500 mb-3">Choose which entries teachers see in the marking menu. Present and Absent are fixed; everything else is optional.</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span><span className="text-xs px-2 py-0.5 rounded-full mr-2 bg-emerald-100 text-emerald-800">Present</span><span className="text-xs text-stone-400">default</span></span>
            <span className="text-xs text-stone-400">always on</span>
          </div>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span><span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${v.cls}`}>{v.label}</span>{SPANNING.includes(k) && <span className="text-xs text-stone-400">carries forward</span>}</span>
              {k === "A" ? <span className="text-xs text-stone-400">always on</span> : (
                <input type="checkbox" checked={enabledStatuses.includes(k)} onChange={() => toggle(k)} className="w-4 h-4 accent-emerald-800" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-1">Add a new entry type</h3>
        <p className="text-xs text-stone-500 mb-3">For anything the school needs later — e.g. Competition, Temple duty, Medical visit. New types appear in marking menus immediately and count as accounted-elsewhere in summaries and reports.</p>
        <div className="flex gap-2">
          <input className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" placeholder="Entry name" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={() => { if (name.trim()) { addCustomStatus(name.trim()); setName(""); } }} className="bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium">Add</button>
        </div>
      </div>
    </div>
  );
}
