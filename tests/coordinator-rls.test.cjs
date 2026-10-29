// Migration 036's permissions, exercised with REAL user tokens against the
// MOCK project — CLAUDE.md §5.1: "confirm both that the allowed action
// succeeds and that the forbidden one fails".
//
//   node --test tests/coordinator-rls.test.cjs
//
// Refuses to run against anything but the mock project ref. Uses the seeded
// mock password (supabase/seed-auth-users.sql) unless MOCK_PASSWORD is set.
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
async function as(email, password = PASSWORD) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}
const denied = (res) => assert.ok(res.error, 'expected a refusal, got success');

const COORD = 'coordinator@gurukula.org';
const TEACHER = 'krishna.saha@gurukula.org';
const SPARE = 'sarita@gurukula.org'; // t06 — a teacher with no class

test('a teacher cannot touch the roster, checkpoints or staff', async () => {
  const t = await as(TEACHER);
  denied(await t.rpc('save_checkpoint', { p_id: null, p_name: 'Hack', p_start: 60, p_end: 90 }));
  denied(await t.rpc('save_duty_default', { p_id: null, p_checkpoint: 'sports', p_label: 'x' }));
  denied(await t.rpc('add_staff_member', { p_name: 'Eve', p_email: 'eve@example.com' }));
  denied(await t.rpc('set_staff_active', { p_staff: 't06', p_active: false }));
  denied(await t.rpc('issue_password_reset', { p_staff: 't06' }));
  // No write policy on the table at all.
  denied(await t.from('duty_defaults').insert({ checkpoint_id: 'sports', group_label: 'x' }));
  const { data } = await t.from('password_resets').select('*');
  assert.deepEqual(data, []);
  // Reading the roster is allowed.
  const read = await t.from('duty_defaults').select('id').limit(1);
  assert.equal(read.error, null);
});

test('a coordinator adds a group and it is on today immediately, then removes it', async () => {
  const c = await as(COORD);
  const today = (await c.rpc('generate_duties_ahead')).data; // also proves the wrapper runs as a user
  assert.match(today, /checkpoints/);
  const { data: row, error } = await c.rpc('save_duty_default', {
    p_id: null, p_checkpoint: 'sports', p_label: 'RLS test · Class 4', p_class_key: '4|A',
    p_scope: 'all', p_staff: 't04', p_days: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(error, null);
  const { data: duties } = await c.from('duties').select('id,staff_id').eq('default_id', row.id);
  assert.ok(duties.length >= 1, 'duty generated for today/tomorrow');
  assert.equal((await c.rpc('remove_duty_default', { p_id: row.id })).error, null);
  const { data: after } = await c.from('duties').select('id').eq('default_id', row.id).eq('state', 'pending');
  assert.equal(after.length, 0);
});

test('a coordinator cannot mint a coordinator, and must hand over duties before deactivating', async () => {
  const c = await as(COORD);
  denied(await c.rpc('add_staff_member', { p_name: 'Boss', p_email: 'boss@example.com', p_role: 'coordinator' }));
  denied(await c.rpc('set_staff_active', { p_staff: 'a1', p_active: false }));
  denied(await c.rpc('issue_password_reset', { p_staff: 'c2' }));
  // t04 is a class teacher with pending duties: no replacement → refused, unchanged.
  denied(await c.rpc('set_staff_active', { p_staff: 't04', p_active: false, p_replacement: null }));
  const { data: still } = await c.from('staff').select('active').eq('id', 't04').single();
  assert.equal(still.active, true);
});

test('a deactivated teacher can no longer read the register; reactivation restores it', async () => {
  const c = await as(COORD);
  const spare = await as(SPARE);
  assert.ok((await spare.from('students').select('admission_no').limit(1)).data.length === 1);
  const off = await c.rpc('set_staff_active', { p_staff: 't06', p_active: false, p_replacement: 'c1' });
  assert.equal(off.error, null);
  try {
    const { data } = await spare.from('students').select('admission_no').limit(1);
    assert.deepEqual(data, []);
    const { data: former } = await c.rpc('list_inactive_staff');
    assert.ok(former.some((s) => s.id === 't06'));
  } finally {
    assert.equal((await c.rpc('set_staff_active', { p_staff: 't06', p_active: true })).error, null);
  }
});

test('a reset code works once, is not guessable, and the coordinator never sees the password', async () => {
  const c = await as(COORD);
  const anon = client();
  const { data: issued, error } = await c.rpc('issue_password_reset', { p_staff: 't06' });
  assert.equal(error, null);
  const { code } = issued[0];
  assert.match(code, /^[A-Z2-9]{8}$/);

  assert.equal((await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: code, p_password: 'short' })).data, 'weak');
  assert.equal((await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: 'WRONG123', p_password: 'Temp-pass-036' })).data, 'invalid');
  assert.equal((await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: code, p_password: 'Temp-pass-036' })).data, 'ok');
  // Once only.
  assert.equal((await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: code, p_password: 'Temp-pass-036' })).data, 'invalid');
  await as(SPARE, 'Temp-pass-036');

  // Put the seeded password back so the mock logins keep working.
  const again = (await c.rpc('issue_password_reset', { p_staff: 't06' })).data[0].code;
  assert.equal((await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: again, p_password: PASSWORD })).data, 'ok');

  // Five wrong guesses burn a code even when the sixth is right.
  const burnt = (await c.rpc('issue_password_reset', { p_staff: 't06' })).data[0].code;
  for (let i = 0; i < 5; i++) {
    await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: 'ZZZZZZZZ', p_password: 'Whatever-123' });
  }
  assert.equal((await anon.rpc('redeem_password_reset', { p_email: SPARE, p_code: burnt, p_password: 'Whatever-123' })).data, 'invalid');
  await as(SPARE);
});

// ── 037: any teacher can add a student ──────────────────────────────────────
// Each run adds one uniquely-numbered test child and then deactivates it, so
// the mock register keeps its size; the inactive row stays because the audit
// log references it.
test('a teacher adds a student to an existing class, but cannot start a class or reuse a number', async () => {
  const t = await as(TEACHER);
  const c = await as(COORD);
  const adm = `QA${Date.now().toString(36).toUpperCase()}`;
  const add = (client, extra) =>
    client.rpc('add_student', {
      p_admission: adm, p_name: 'QA Test Student', p_grade: 4, p_section: 'A',
      p_stype: 'Day Scholar', ...extra,
    });

  const made = await add(t);
  assert.equal(made.error, null);
  assert.equal(made.data.section, 'A');
  assert.ok(made.data.roll_no > 0, 'roll number defaults to the next one in the class');
  try {
    // Same number again → refused, for anyone.
    const again = await add(c);
    assert.equal(again.error?.code, '23505');
    // A class nobody is in yet → teacher refused.
    const fresh = await t.rpc('add_student', {
      p_admission: `${adm}X`, p_name: 'QA New Class', p_grade: 4, p_section: 'ZZQA', p_stype: 'Residential',
    });
    assert.equal(fresh.error?.code, '42501');
    // Direct table write is still closed to teachers.
    denied(await t.from('students').insert({ admission_no: `${adm}Y`, name: 'x', grade: 4, section: 'A', stype: 'Residential' }));
    // Nurse cannot add.
    const nurse = await as('nurse@gurukula.org');
    assert.equal((await add(nurse, { p_admission: `${adm}N` })).error?.code, '42501');
    // The activity log names the teacher who added them.
    const { data: log } = await c.from('audit_log').select('actor_id').eq('action', 'student_added').eq('admission_no', adm);
    assert.equal(log[0]?.actor_id, 't1');
  } finally {
    await c.from('students').update({ active: false }).eq('admission_no', adm);
  }
});
