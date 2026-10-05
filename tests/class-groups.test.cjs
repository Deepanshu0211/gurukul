const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const requireModule = (name) => {
    if (name === 'react') return {};
    if (name.endsWith('/supabase') || name === './supabase') return { supabase: {} };
    if (name.endsWith('/utils/format')) return { todayISO: () => '2026-10-02' };
    return load(path.relative(root, path.resolve(path.dirname(file), name + '.js')));
  };
  vm.runInNewContext(code, { exports, require: requireModule }, { filename: file });
  return exports;
}

const { resolveGroup } = load('src/lib/duties.js');
const { fromRow } = load('src/lib/students.js');
const { combinedClassGrade, classCoversClass, scopeAttendanceQuery } = load('src/domain/classGroups.js');
const { recordDuties, recordRoster, recordAbsences, groupAttendanceRecords } = load('src/lib/classRecords.js');
const { ownRow, assignedStatusRows, assignmentStatusLabel } = load('src/lib/statusBoard.js');
const { dutyStatus, DUTY_STATUS } = load('src/domain/duties.js');
const students = [
  ['k', 10, 'KRISHNA', 'Residential'],
  ['b', 10, 'BALRAM', 'Residential'],
  ['v', 10, 'Vedic', 'Residential'],
  ['day', 10, 'KRISHNA', 'Day Scholar'],
  ['other', 9, 'KRISHNA', 'Residential'],
].map(([id, grade, section, stype]) => fromRow({ admission_no: id, name: id, grade, section, stype }));

test('one grade register covers all three residential sections and excludes other grades/day scholars', () => {
  const roster = resolveGroup({ classKey: '10|*', scope: 'res' }, students);
  assert.deepEqual(Array.from(roster, s => s.id).sort(), ['b', 'k', 'v']);
  assert.equal(new Set(roster.map(s => s.id)).size, roster.length);
});

test('the old mock section and whole-school register rules remain available', () => {
  assert.deepEqual(Array.from(resolveGroup({ classKey: '10|KRISHNA', scope: 'res' }, students), s => s.id), ['k']);
  assert.equal(resolveGroup({ scope: 'res' }, students).length, 4);
  assert.equal(resolveGroup({ scope: 'all' }, students).length, 5);
});

test('record visibility and status lookup recognize combined classes without matching another grade', () => {
  assert.equal(classCoversClass('10|*', '10|BALRAM'), true);
  assert.equal(classCoversClass('10|*', '9|BALRAM'), false);
  assert.equal(classCoversClass('10|KRISHNA', '10|BALRAM'), false);
  const row = { classKey: '10|*', strength: 40 };
  assert.equal(ownRow([row], '10|KRISHNA'), row);
  assert.equal(ownRow([row], '9|KRISHNA'), null);
});

test('combined printed registers filter marks by grade, section registers by exact key', () => {
  const calls = [];
  const query = { eq: (field, value) => { calls.push([field, value]); return query; }, not: (...args) => { calls.push(args); return query; } };
  assert.equal(scopeAttendanceQuery(query, '10|*'), query);
  scopeAttendanceQuery(query, '10|BALRAM');
  assert.deepEqual(calls, [['grade', 10], ['section', 'ilike', 'vedic'], ['class_key', '10|BALRAM']]);
  assert.equal(combinedClassGrade('10|*'), 10);
  assert.equal(combinedClassGrade('10|KRISHNA'), null);
});

test('student section labels remain full names inside the combined register', () => {
  assert.equal(students[0].label, '10 Krishna');
  assert.equal(students[1].label, '10 Balram');
  assert.equal(students[2].label, '10 Vedic');
  assert.equal(students[0].key, '10|KRISHNA');
});

test('personal status follows all assigned classes, dates and checkpoints rather than a primary class', () => {
  const day = '2026-10-02';
  const rows = [4, 6, 7, 12].map(grade => ({ classKey: `${grade}|*`, classLabel: `Class ${grade}` }));
  const duties = [4, 7, 12].map(grade => ({ classKey: `${grade}|*`, group: `Class ${grade}`, staffId: 't3', day, checkpointId: 'morning' }));
  duties.push({ classKey: '6|*', group: 'Class 6', staffId: 't3', day: '2026-10-03', checkpointId: 'morning' });
  duties.push({ classKey: '6|*', group: 'Class 6', staffId: 't3', day, checkpointId: 'breakfast' });
  assert.deepEqual(Array.from(assignedStatusRows(rows, duties, 't3', day), row => row.classKey), ['4|*', '7|*', '12|*']);
  assert.equal(assignmentStatusLabel(duties, 't3', day), 'Counts for Classes 4, 7 and 12');
  assert.deepEqual(Array.from(assignedStatusRows(rows, duties, 't3', '2026-10-03'), row => row.classKey), ['6|*']);
  const reassigned = duties.map(d => d.classKey === '7|*' ? { ...d, staffId: 't2' } : d);
  assert.deepEqual(Array.from(assignedStatusRows(rows, reassigned, 't3', day), row => row.classKey), ['4|*', '12|*']);
  assert.equal(assignmentStatusLabel(reassigned, 't3', day), 'Counts for Classes 4 and 12');
  assert.equal(assignedStatusRows(rows, reassigned, 'unassigned', day).length, 0);
  assert.equal(assignmentStatusLabel([], 't3', day), 'No classes assigned for this day');
});

test('pilot duties open exactly at 06:15 and never become actionable on a future date', () => {
  const duty = { id: 'physical', pilotWindow: true, day: '2026-10-02', start: 375, end: 1440 };
  assert.equal(dutyStatus(duty, {}, 374), DUTY_STATUS.UPCOMING);
  assert.equal(dutyStatus(duty, {}, 375), DUTY_STATUS.DUE);
  assert.equal(dutyStatus(duty, {}, 1439), DUTY_STATUS.DUE);
  assert.equal(dutyStatus({ ...duty, day: '2026-10-03' }, {}, 375), DUTY_STATUS.UPCOMING);
  assert.equal(dutyStatus({ ...duty, day: '2026-10-01' }, {}, 375), DUTY_STATUS.OVERDUE);
  assert.equal(dutyStatus(duty, { physical: { statuses: {} } }, 375), DUTY_STATUS.DONE);
});

test('Records includes the academic class even if marked by somebody else, and excludes other assigned classes', () => {
  const user = { id: 'teacher', role: 'teacher', classKey: '10|KRISHNA' };
  const duties = [
    { id: 'own-grade', classKey: '10|*', scope: 'res', staffId: 'other-teacher' },
    { id: 'assigned-other-grade', classKey: '9|*', scope: 'res', staffId: 'teacher' },
    { id: 'assigned-other-section', classKey: '10|BALRAM', scope: 'res', staffId: 'teacher' },
    { id: 'school-wide', scope: 'res', staffId: 'teacher' },
  ];
  const readable = recordDuties(duties, students, user);
  assert.deepEqual(Array.from(readable, d => d.id), ['own-grade', 'school-wide']);
  assert.deepEqual(Array.from(recordRoster(duties[0], students, user), s => s.id), ['k']);
  assert.deepEqual(Array.from(recordRoster(duties[3], students, user), s => s.id), ['k']);
  const records = { 'own-grade': { statuses: { k: 'A', b: 'A', v: 'A' } }, 'school-wide': { statuses: { b: 'A', other: 'A' } } };
  assert.equal(recordAbsences(readable, records, students, user), 1, 'Other sections must not inflate own-class absences');
});

test('Records retains full groups for oversight and never falls back to school-wide records for an unassigned teacher', () => {
  const duties = [{ id: 'own-grade', classKey: '10|*', scope: 'res' }, { id: 'other-grade', classKey: '9|*', scope: 'res' }];
  for (const role of ['coordinator', 'admin', 'management']) {
    const user = { role };
    assert.equal(recordDuties(duties, students, user).length, 2);
    assert.equal(recordRoster(duties[0], students, user).length, 3);
    assert.equal(recordAbsences(duties, { 'own-grade': { statuses: { k: 'A', b: 'A' } } }, students, user), 2);
  }
  const user = { role: 'teacher' };
  assert.equal(recordDuties(duties, students, user).length, 0);
  assert.equal(recordRoster(duties[0], students, user).length, 0);
});

const { attendanceStudentLabel, VEDIC_CLASS_KEY } = load('src/domain/classGroups.js');
const partitionStudents = [...students,
 fromRow({admission_no:'v4',name:'Vedic four',grade:4,section:'VEDIC',stype:'Residential',roll_no:400}),
 fromRow({admission_no:'vday',name:'Vedic day',grade:7,section:'Vedic',stype:'Day Scholar',roll_no:700}),
 fromRow({admission_no:'regular4',name:'Krishna four',grade:4,section:'KRISHNA',stype:'Residential',roll_no:401})];
test('cross-grade Vedic register is exclusive and preserves original classes',()=>{
 const group=resolveGroup({classKey:VEDIC_CLASS_KEY,scope:'res'},partitionStudents);
 assert.deepEqual(Array.from(group,s=>s.id),['v4','v']);
 assert.equal(attendanceStudentLabel(group[0],{classKey:VEDIC_CLASS_KEY}),'Class 4 Vedic');
 assert.equal(attendanceStudentLabel(group[1],{classKey:VEDIC_CLASS_KEY}),'Class 10 Vedic');
 assert.equal(group[0].key,'4|VEDIC');
 const regular=resolveGroup({classKey:'10|*',scope:'res',excludeVedic:true},partitionStudents);
 assert.deepEqual(Array.from(regular,s=>s.id).sort(),['b','k']);
 assert.equal(regular.some(s=>group.some(v=>v.id===s.id)),false);
});
test('every checkpoint can separate Vedic without losing its residential or band eligibility',()=>{
 for(const checkpointId of ['morning','mang','breakfast','lunch','night']) {
  const regular=resolveGroup({checkpointId,scope:'res',excludeVedic:true},partitionStudents);
  const vedic=resolveGroup({checkpointId,scope:'res',classKey:VEDIC_CLASS_KEY},partitionStudents);
  const original=resolveGroup({checkpointId,scope:'res'},partitionStudents);
  assert.deepEqual([...regular,...vedic].map(s=>s.id).sort(),Array.from(original,s=>s.id).sort());
  assert.equal(new Set([...regular,...vedic].map(s=>s.id)).size,original.length);
 }
 assert.equal(resolveGroup({classKey:VEDIC_CLASS_KEY,scope:'all'},partitionStudents).length,3);
 assert.deepEqual(Array.from(resolveGroup({band:'Primary',scope:'res',excludeVedic:true},partitionStudents),s=>s.id),['regular4']);
});
test('Vedic assignments and academic Records use the correct cross-grade group',()=>{
 assert.equal(classCoversClass(VEDIC_CLASS_KEY,'10|Vedic'),true);
 assert.equal(classCoversClass(VEDIC_CLASS_KEY,'4|VEDIC'),true);
 assert.equal(classCoversClass('10|*','10|Vedic'),false);
 assert.equal(classCoversClass('10|*','10|KRISHNA'),true);
 const rows=[{classKey:'10|*',classLabel:'Class 10'},{classKey:VEDIC_CLASS_KEY,classLabel:'Vedic'}];
 const duties=[{id:'v',classKey:VEDIC_CLASS_KEY,day:'2026-10-05',checkpointId:'morning',staffId:'t11',scope:'res'}];
 assert.deepEqual(Array.from(assignedStatusRows(rows,duties,'t11','2026-10-05'),r=>r.classKey),[VEDIC_CLASS_KEY]);
 assert.equal(ownRow(rows,'10|Vedic'),rows[1]);
 assert.equal(ownRow(rows,'10|KRISHNA'),rows[0]);
 assert.deepEqual(Array.from(recordRoster(duties[0],partitionStudents,{role:'teacher',classKey:VEDIC_CLASS_KEY}),s=>s.id),['v4','v']);
 assert.deepEqual(Array.from(recordRoster(duties[0],partitionStudents,{role:'teacher',classKey:'10|Vedic'}),s=>s.id),['v']);
});
test('Vedic and regular reports scope student marks without changing academic data',()=>{
 const calls=[]; const query={eq:(...a)=>{calls.push(['eq',...a]);return query;},ilike:(...a)=>{calls.push(['ilike',...a]);return query;},not:(...a)=>{calls.push(['not',...a]);return query;}};
 scopeAttendanceQuery(query,VEDIC_CLASS_KEY);scopeAttendanceQuery(query,'10|*');
 assert.deepEqual(calls,[['ilike','section','vedic'],['eq','grade',10],['not','section','ilike','vedic']]);
});


test('saved attendance is regrouped without rewriting marks, source IDs, authors or dates', () => {
 const oldDuties=[
  {id:'class4',day:'2026-10-03',checkpointId:'morning',start:375,group:'Class 4',classKey:'4|*',scope:'res'},
  {id:'class10',day:'2026-10-03',checkpointId:'morning',start:375,group:'Class 10',classKey:'10|*',scope:'res'},
 ];
 const oldRecords={
  class4:{statuses:{v4:'A',regular4:'S'},submittedBy:'t7',submittedAt:'2026-10-03T01:00:00Z'},
  class10:{statuses:{v:'H',k:'A'},submittedBy:'t1',submittedAt:'2026-10-03T01:10:00Z'},
 };
 const before=JSON.stringify({oldDuties,oldRecords,partitionStudents});
 const grouped=groupAttendanceRecords(oldDuties,oldRecords,partitionStudents);
 assert.equal(grouped.error,undefined);
 assert.deepEqual(Array.from(grouped.duties,d=>d.group),['Class 4','Class 10','Vedic']);
 const vedic=grouped.duties[2], record=grouped.records[vedic.id];
 assert.deepEqual(Array.from(recordRoster(vedic,partitionStudents,{role:'admin'}),s=>s.id),['v4','v']);
 assert.equal(record.statuses.v4,'A');assert.equal(record.statuses.v,'H');
 assert.equal(record.sources.v4.dutyId,'class4');assert.equal(record.sources.v4.submittedBy,'t7');
 assert.equal(record.sources.v.submittedAt,oldRecords.class10.submittedAt);
 assert.equal(record.submittedAt,null,'Several registers must not pretend to have one submission time');
 assert.deepEqual(Array.from(record.submittedByIds),['t7','t1']);
 assert.equal(recordAbsences(grouped.duties,grouped.records,partitionStudents,{role:'admin'}),2);
 assert.equal(JSON.stringify({oldDuties,oldRecords,partitionStudents}),before);
});

test('historical Vedic category contains submitted students only, never inventing present marks', () => {
 const duties=[{id:'class4',day:'2026-10-03',checkpointId:'morning',start:375,group:'Class 4',classKey:'4|*',scope:'res'},
 {id:'class10',day:'2026-10-03',checkpointId:'morning',start:375,group:'Class 10',classKey:'10|*',scope:'res'}];
 const grouped=groupAttendanceRecords(duties,{class4:{statuses:{},submittedBy:'t7'}},partitionStudents);
 const duty=grouped.duties.find(d=>d.classKey===VEDIC_CLASS_KEY);
 assert.deepEqual(Array.from(recordRoster(duty,partitionStudents,{role:'teacher',classKey:VEDIC_CLASS_KEY}),s=>s.id),['v4']);
 assert.equal(grouped.records[duty.id].sources.v,undefined);
});

test('historical Vedic projection separates activities and rejects duplicate source marks visibly', () => {
 const base={day:'2026-10-03',start:375,group:'Class 4',classKey:'4|*',scope:'res'};
 const duties=[{...base,id:'morning',checkpointId:'morning'},{...base,id:'breakfast',checkpointId:'breakfast'}];
 const records={morning:{statuses:{v4:'A'}},breakfast:{statuses:{v4:'H'}}};
 const grouped=groupAttendanceRecords(duties,records,partitionStudents);
 const vedic=grouped.duties.filter(d=>d.classKey===VEDIC_CLASS_KEY);
 assert.equal(vedic.length,2);
 assert.equal(grouped.records[vedic.find(d=>d.checkpointId==='breakfast').id].statuses.v4,'H');
 assert.equal(grouped.records[vedic.find(d=>d.checkpointId==='morning').id].statuses.v4,'A');
 const duplicate=groupAttendanceRecords([duties[0],{...duties[0],id:'duplicate'}],{...records,duplicate:records.morning},partitionStudents);
 assert.match(duplicate.error,/Duplicate saved attendance/);
 assert.equal(duplicate.duties.length,0);
});
