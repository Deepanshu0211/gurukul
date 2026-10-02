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
const { combinedClassGrade, classCoversClass, scopeAttendanceQuery, scopeDutyHistoryQuery } = load('src/domain/classGroups.js');
const { recordDuties, recordRoster, recordAbsences } = load('src/lib/classRecords.js');
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
  const query = { eq: (field, value) => { calls.push([field, value]); return query; } };
  assert.equal(scopeAttendanceQuery(query, '10|*'), query);
  scopeAttendanceQuery(query, '10|BALRAM');
  assert.deepEqual(calls, [['grade', 10], ['class_key', '10|BALRAM']]);
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

test('class report duty history includes grade and school-wide submissions while mark queries remain section-only', () => {
  const calls = [];
  const query = { or: value => { calls.push(value); return query; }, eq: (key, value) => { calls.push([key, value]); return query; } };
  scopeDutyHistoryQuery(query, '10|KRISHNA');
  scopeAttendanceQuery(query, '10|KRISHNA');
  assert.equal(calls[0], 'class_key.eq."10|KRISHNA",class_key.eq."10|*",class_key.is.null');
  assert.deepEqual(calls[1], ['class_key', '10|KRISHNA']);
  assert.equal(scopeDutyHistoryQuery(query, null), query);
});
