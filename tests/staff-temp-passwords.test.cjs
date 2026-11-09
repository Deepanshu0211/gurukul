// Migration 048's temporary passwords, exercised with REAL user tokens against
// the MOCK project (CLAUDE.md §5.1).
//
//   node --test tests/staff-temp-passwords.test.cjs
//
// Each run adds one throwaway teacher (temp.test.<time>@example.com) and
// deactivates it at the end. Refuses to run against anything but mock.
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
const canSignIn = async (email, password) =>
  !(await client().auth.signInWithPassword({ email, password })).error;

const COORD = 'coordinator@gurukula.org';
const TEACHER = 'krishna.saha@gurukula.org';

test('coordinator adds a teacher with Initial@123; teacher must change it; only then is it private', async () => {
  const c = await as(COORD);
  const email = `temp.test.${Date.now()}@example.com`;

  const add = await c.rpc('add_staff_member_with_login', {
    p_name: 'Temp Test Teacher', p_email: email, p_phone: null,
    p_role: 'teacher', p_class_key: null, p_random: false,
  });
  assert.ifError(add.error);
  const { staff_id: id, temp_password: pw } = add.data[0];
  assert.equal(pw, 'Initial@123');

  try {
    // Coordinator can read it back; a teacher cannot read anyone's.
    const list = await c.rpc('list_staff_logins');
    assert.ifError(list.error);
    const row = list.data.find((r) => r.staff_id === id);
    assert.equal(row.temp_password, 'Initial@123');
    assert.equal(row.must_change, true);
    const t = await as(TEACHER);
    const tl = await t.rpc('list_staff_logins');
    assert.equal((tl.data || []).length, 0, 'teacher sees no logins');
    assert.ok((await t.rpc('set_temporary_password', { p_staff: id, p_random: true })).error);
    const direct = await t.from('staff_temp_passwords').select('*');
    assert.ok(direct.error || direct.data.length === 0, 'no direct read of the table');
    const directC = await c.from('staff_temp_passwords').select('*');
    assert.ok(directC.error || directC.data.length === 0, 'coordinator only via list_staff_logins');

    // Coordinator may not touch another coordinator's login.
    const { data: coords } = await c.from('staff').select('id').eq('role', 'coordinator').neq('email', COORD).limit(1);
    if (coords?.length) {
      assert.ok((await c.rpc('set_temporary_password', { p_staff: coords[0].id, p_random: false })).error);
    }

    // The new teacher signs in straight away and is flagged to change.
    const n = await as(email, 'Initial@123');
    const me = await n.from('staff').select('must_change_password').eq('id', id).single();
    assert.equal(me.data.must_change_password, true);
    assert.ok((await n.rpc('change_my_temporary_password', { p_password: 'Initial@123' })).error, 'same password refused');
    assert.ifError((await n.rpc('change_my_temporary_password', { p_password: 'MyOwnPass#77' })).error);

    assert.equal(await canSignIn(email, 'Initial@123'), false, 'old password dead');
    assert.equal(await canSignIn(email, 'MyOwnPass#77'), true, 'new password works');
    const after = (await c.rpc('list_staff_logins')).data.find((r) => r.staff_id === id);
    assert.equal(after.temp_password, null, 'coordinator can no longer see it');
    assert.equal(after.must_change, false);

    // A random reset: works, is shown, and flags again.
    const r = await c.rpc('set_temporary_password', { p_staff: id, p_random: true });
    assert.ifError(r.error);
    assert.match(r.data, /^[A-Za-z]{5}@[2-9]{3}$/);
    assert.equal(await canSignIn(email, 'MyOwnPass#77'), false);
    assert.equal(await canSignIn(email, r.data), true);
    assert.equal((await c.rpc('list_staff_logins')).data.find((x) => x.staff_id === id).must_change, true);
  } finally {
    await c.rpc('set_staff_active', { p_staff: id, p_active: false, p_replacement: null });
  }
});
