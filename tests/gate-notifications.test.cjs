// Migration 047's gate notifications, exercised with REAL user tokens against
// the MOCK project — CLAUDE.md §5.1: "confirm both that the allowed action
// succeeds and that the forbidden one fails".
//
//   node --test tests/gate-notifications.test.cjs
//
// Refuses to run against anything but the mock project ref.
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

const TEACHER = 'krishna.saha@gurukula.org';
const COORD = 'coordinator@gurukula.org';
const ADMIN = 'admin@gurukula.org';
const MOD = 'principal@gurukula.org';

test('a teacher sign-out and sign-in reach the coordinator, MOD and admin — and only them', async () => {
  const t = await as(TEACHER);
  const c = await as(COORD);
  const a = await as(ADMIN);
  const m = await as(MOD);

  // A student who is on campus.
  const { data: away } = await t.from('student_leave').select('admission_no').is('in_at', null);
  const awaySet = new Set((away || []).map((r) => r.admission_no));
  const { data: kids } = await t.from('students').select('admission_no').eq('active', true).limit(50);
  const adm = kids.find((k) => !awaySet.has(k.admission_no)).admission_no;

  const out = await t.rpc('sign_student_out', { p_adm: adm, p_status: 'H', p_reason: 'test: going home', p_expected: null });
  assert.ifError(out.error);
  const leaveId = (Array.isArray(out.data) ? out.data[0] : out.data).id;

  try {
    // Coordinator sees it, unread.
    const { data: cn, error: ce } = await c.from('notifications')
      .select('*, notification_reads(staff_id)').eq('leave_id', leaveId);
    assert.ifError(ce);
    assert.equal(cn.length, 1);
    assert.equal(cn[0].kind, 'student_out');
    assert.equal(cn[0].actor_role, 'teacher');
    assert.equal(cn[0].notification_reads.length, 0, 'unread for the coordinator');

    // MOD and admin see it too.
    assert.equal((await m.from('notifications').select('id').eq('leave_id', leaveId)).data.length, 1);
    assert.equal((await a.from('notifications').select('id').eq('leave_id', leaveId)).data.length, 1);

    // Teacher reads nothing and cannot forge one.
    assert.equal((await t.from('notifications').select('id').eq('leave_id', leaveId)).data.length, 0);
    const forged = await t.from('notifications').insert({ kind: 'student_out', admission_no: adm });
    assert.ok(forged.error, 'teacher insert must be refused');
    assert.ok((await t.rpc('mark_notifications_read', { p_ids: [cn[0].id] })).error, 'teacher cannot mark read');

    // Coordinator marks read -> read for them, still unread for admin.
    assert.ifError((await c.rpc('mark_notifications_read', { p_ids: [cn[0].id] })).error);
    const cr = await c.from('notifications').select('notification_reads(staff_id)').eq('id', cn[0].id).single();
    assert.equal(cr.data.notification_reads.length, 1);
    const ar = await a.from('notifications').select('notification_reads(staff_id)').eq('id', cn[0].id).single();
    assert.equal(ar.data.notification_reads.length, 0, 'admin still unread');

    // Coordinator cannot delete the record.
    await c.from('notifications').delete().eq('id', cn[0].id);
    assert.equal((await a.from('notifications').select('id').eq('id', cn[0].id)).data.length, 1);
  } finally {
    const back = await t.rpc('sign_student_in', { p_adm: adm });
    assert.ifError(back.error);
  }

  const { data: inn } = await c.from('notifications').select('kind').eq('leave_id', leaveId).order('id');
  assert.deepEqual(inn.map((r) => r.kind), ['student_out', 'student_in']);
});
