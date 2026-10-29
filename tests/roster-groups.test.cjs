// Hand-picked groups and per-group exclusions (migration 036) must resolve in
// the app exactly as `attendance_group_contains` resolves them in the
// database — a mismatch is a child missing from a roll call.
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
    if (name === 'react') return { useCallback: () => {}, useEffect: () => {}, useState: () => [] };
    if (name.endsWith('/supabase') || name === './supabase') return { supabase: {} };
    if (name.endsWith('/utils/format')) return { todayISO: () => '2026-10-29' };
    return load(path.relative(root, path.resolve(path.dirname(file), name + '.js')));
  };
  vm.runInNewContext(code, { exports, require: requireModule }, { filename: file });
  return exports;
}

const { resolveGroup } = load('src/lib/duties.js');
const { fromRow } = load('src/lib/students.js');
const { coverageOf, COVERAGE, daysLabel, parseHHMM, toHHMM } = load('src/lib/roster.js');
const { canManageRoster, canManageStaffMember } = load('src/domain/roles.js');
const { housesIn, houseRank, NO_HOUSE } = load('src/domain/houses.js');

const students = [
  ['a', 6, 'KRISHNA', 'Residential', 'Barsana'],
  ['b', 6, 'KRISHNA', 'Day Scholar', 'Vrindavan'],
  ['c', 6, 'BALRAM', 'Residential', 'Nandgaon'],
  ['v', 6, 'Vedic', 'Residential', 'Goverdhan'],
  ['s', 10, 'KRISHNA', 'Residential', null],
].map(([id, grade, section, stype, house]) => fromRow({ admission_no: id, name: id, grade, section, stype, house }));
const ids = (list) => Array.from(list, (s) => s.adm).sort();

test('a hand-picked list is exactly its members, whatever class they are in', () => {
  assert.deepEqual(ids(resolveGroup({ members: ['a', 's'] }, students)), ['a', 's']);
  // excludeVedic does not strip a Vedic child somebody picked by name.
  assert.deepEqual(ids(resolveGroup({ members: ['v'], excludeVedic: true }, students)), ['v']);
  // ...but residential-only still sends a picked day scholar home.
  assert.deepEqual(ids(resolveGroup({ members: ['a', 'b'], scope: 'res' }, students)), ['a']);
  assert.deepEqual(ids(resolveGroup({ members: [] }, students)), []);
});

test('excluded narrows any group and composes with class, band and house', () => {
  assert.deepEqual(ids(resolveGroup({ classKey: '6|KRISHNA', excluded: ['b'] }, students)), ['a']);
  assert.deepEqual(ids(resolveGroup({ band: 'Middle', excluded: ['c', 'v'] }, students)), ['a', 'b']);
  assert.deepEqual(ids(resolveGroup({ house: 'Barsana', excluded: ['a'] }, students)), []);
  // No exclusions behaves exactly as before 036.
  assert.deepEqual(ids(resolveGroup({ band: 'Middle', excluded: null }, students)), ['a', 'b', 'c', 'v']);
});

test('roster helpers', () => {
  assert.equal(coverageOf({ members: ['a'] }), COVERAGE.PICK);
  assert.equal(coverageOf({ classKey: '6|KRISHNA' }), COVERAGE.CLASS);
  assert.equal(coverageOf({ band: 'Senior' }), COVERAGE.BAND);
  assert.equal(coverageOf({ house: 'Barsana', band: 'Senior' }), COVERAGE.HOUSE);
  assert.equal(coverageOf({}), COVERAGE.SCHOOL);
  assert.equal(daysLabel([1, 2, 3, 4, 5]), 'Mon–Fri');
  assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  assert.equal(daysLabel([1, 3, 5]), 'Mon, Wed, Fri');
  assert.equal(parseHHMM('16:30'), 990);
  assert.equal(parseHHMM('7.05'), 425);
  assert.equal(parseHHMM('25:00'), null);
  assert.equal(parseHHMM('noon'), null);
  assert.equal(toHHMM(990), '16:30');
});

test('only coordinator and admin run the roster; coordinators cannot touch senior accounts', () => {
  assert.equal(canManageRoster('coordinator'), true);
  assert.equal(canManageRoster('admin'), true);
  assert.equal(canManageRoster('management'), false);
  assert.equal(canManageRoster('teacher'), false);
  assert.equal(canManageStaffMember('coordinator', 'teacher'), true);
  assert.equal(canManageStaffMember('coordinator', 'coordinator'), false);
  assert.equal(canManageStaffMember('coordinator', 'admin'), false);
  assert.equal(canManageStaffMember('admin', 'coordinator'), true);
  assert.equal(canManageStaffMember('teacher', 'teacher'), false);
});

test('houses come out in the printed sheet order, unassigned last', () => {
  assert.deepEqual(Array.from(housesIn(students)), ['Vrindavan', 'Goverdhan', 'Nandgaon', 'Barsana']);
  assert.ok(houseRank(NO_HOUSE) > houseRank('Barsana'));
});
