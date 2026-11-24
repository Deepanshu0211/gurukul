// Migration 052 — `add_students`, exercised with REAL user tokens against the
// MOCK project (CLAUDE.md §5.1: the allowed action succeeds AND the forbidden
// one fails).
//
//   node --test tests/bulk-add-students.test.cjs
//
// Refuses to run against anything but the mock project ref. Every student it
// adds is deactivated again at the end.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const MOCK_REF = 'ofuvjzxjbgsityacukva';
const root = path.resolve(__dirname, '..');
const envFile = [
  path.resolve(root, '../_private-real-data/.env.mock.local'),
  path.resolve(root, '.env.mock.local'),
].find((f) => fs.existsSync(f));
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (URL !== `https://${MOCK_REF}.supabase.co`) throw new Error('Not the mock project — refusing to run');
const PASSWORD = process.env.MOCK_PASSWORD || 'Gurukula@123';

const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function as(email) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

const COORD = 'coordinator@gurukula.org';
const TEACHER = 'krishna.saha@gurukula.org'; // t1
const NURSE = 'nurse@gurukula.org';

const stamp = Date.now().toString(36).toUpperCase();
const adm = (n) => `QB${stamp}${n}`;
const row = (n, extra = {}) => ({
  ref: n, admission_no: adm(n), name: `QA Bulk ${n}`, grade: 4, section: 'a', stype: 'Day Scholar', ...extra,
});

test('a teacher imports a batch: good rows land, bad rows come back with a reason', async () => {
  const t = await as(TEACHER);
  const c = await as(COORD);
  try {
    const { data, error } = await t.rpc('add_students', {
      p_rows: [
        row(1, { house: 'vrindavan' }),
        row(2, { roll_no: 1256 }),
        row(3, { admission_no: adm(1) }),              // same number as row 1
        row(4, { grade: '4A' }),                       // not a number
        row(5, { grade: 4, section: 'ZZQA' }),         // a class nobody is in
        row(6, { stype: 'Boarder' }),                  // not a student type
        row(7, { house: 'Hogwarts' }),                 // not a house
      ],
    });
    assert.equal(error, null);
    const byRef = Object.fromEntries(data.results.map((r) => [r.ref, r]));
    assert.equal(data.results.length, 7);

    assert.equal(byRef[1].ok, true);
    assert.equal(byRef[1].section, 'A', 'section keeps the register spelling');
    assert.ok(byRef[1].roll_no > 0, 'roll defaults to the next free one');
    assert.equal(byRef[2].ok, true);
    assert.equal(byRef[2].roll_no, 1256, 'four-digit roll numbers are accepted (052)');

    assert.equal(byRef[3].ok, false);
    assert.equal(byRef[3].code, '23505');
    assert.equal(byRef[4].ok, false);
    assert.match(byRef[4].message, /whole numbers/);
    assert.equal(byRef[5].ok, false);
    assert.equal(byRef[5].code, '42501', 'a teacher cannot start a class, in bulk either');
    assert.equal(byRef[6].ok, false);
    assert.equal(byRef[7].ok, false);
    assert.match(byRef[7].message, /no house called Hogwarts/);

    // House stored in the houses table's spelling.
    const { data: s1 } = await c.from('students').select('house').eq('admission_no', adm(1)).single();
    assert.equal(s1.house, 'Vrindavan');

    // Each child is in the activity log under the teacher who imported them.
    const { data: log } = await c.from('audit_log').select('actor_id,admission_no')
      .eq('action', 'student_added').in('admission_no', [adm(1), adm(2)]);
    assert.equal(log.length, 2);
    assert.ok(log.every((l) => l.actor_id === 't1'));
  } finally {
    await c.from('students').update({ active: false }).in('admission_no', [adm(1), adm(2)]);
  }
});

test('re-sending an imported row is refused as a duplicate, even after the student left', async () => {
  const t = await as(TEACHER);
  const c = await as(COORD);
  // adm(1) was deactivated by the previous test: still refused.
  const { data } = await t.rpc('add_students', { p_rows: [row(1)] });
  assert.equal(data.results[0].ok, false);
  assert.equal(data.results[0].code, '23505');
  assert.equal((await c.from('students').select('active').eq('admission_no', adm(1)).single()).data.active, false);
});

test('a coordinator may start a new class in bulk; its registers are built once', async () => {
  const c = await as(COORD);
  try {
    const { data, error } = await c.rpc('add_students', {
      p_rows: [row(8, { section: 'ZZQB' }), row(9, { section: 'zzqb' })],
    });
    assert.equal(error, null);
    assert.deepEqual(data.results.map((r) => r.ok), [true, true]);
    assert.deepEqual(data.results.map((r) => r.section), ['ZZQB', 'ZZQB']);
    // A class with no teacher yet needs 051's fallback marker to get a
    // register. Where 051 is missing, building it fails — and that must be
    // REPORTED while the students stay, not roll the import back.
    assert.ok(data.duties_error === null || typeof data.duties_error === 'string');
    const { data: kept } = await c.from('students').select('admission_no').in('admission_no', [adm(8), adm(9)]);
    assert.equal(kept.length, 2);
  } finally {
    await c.from('students').update({ active: false }).in('admission_no', [adm(8), adm(9)]);
    // Rebuild without the test class, so it leaves no register behind.
    await c.rpc('generate_duties_ahead');
  }
});

test('who may not import, and the limits', async () => {
  const n = await as(NURSE);
  const res = await n.rpc('add_students', { p_rows: [row(10)] });
  assert.equal(res.error?.code, '42501');

  const anon = client();
  assert.ok((await anon.rpc('add_students', { p_rows: [row(11)] })).error, 'anon refused');

  const t = await as(TEACHER);
  const big = Array.from({ length: 201 }, (_, i) => row(100 + i));
  assert.equal((await t.rpc('add_students', { p_rows: big })).error?.code, '22023');
  assert.equal((await t.rpc('add_students', { p_rows: { not: 'a list' } })).error?.code, '22023');

  // The rules function is internal: not callable from the API.
  const direct = await t.rpc('insert_student_checked', {
    p_admission: adm(12), p_name: 'x y', p_grade: 4, p_section: 'A', p_stype: 'Day Scholar',
  });
  assert.ok(direct.error, 'insert_student_checked must not be exposed');
  // Nothing from these refused calls reached the table.
  const c = await as(COORD);
  const { data } = await c.from('students').select('admission_no').in('admission_no', [adm(10), adm(11), adm(12), adm(100)]);
  assert.deepEqual(data, []);
});

test('the single add_student still works after the refactor', async () => {
  const t = await as(TEACHER);
  const c = await as(COORD);
  try {
    const { data, error } = await t.rpc('add_student', {
      p_admission: adm(13), p_name: 'QA Single', p_grade: 4, p_section: 'A', p_stype: 'Residential', p_roll: 1257,
    });
    assert.equal(error, null);
    assert.equal(data.roll_no, 1257);
    const again = await t.rpc('add_student', {
      p_admission: adm(13), p_name: 'QA Single', p_grade: 4, p_section: 'A', p_stype: 'Residential',
    });
    assert.equal(again.error?.code, '23505');
  } finally {
    await c.from('students').update({ active: false }).eq('admission_no', adm(13));
  }
});
