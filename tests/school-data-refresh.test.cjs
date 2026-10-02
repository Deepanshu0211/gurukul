const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Exercise the real provider's async flow with controlled request timing.
function providerHarness() {
  const slots = [], effects = [], appListeners = [], requests = [], marks = new Map();
  let cursor = 0, today = '2026-10-02';
  const memo = (make, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
      slots[index] = { value: make(), deps };
    }
    return slots[index].value;
  };
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props) => ({ type, props }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => memo(() => { effects.push(fn); }, deps),
  };
  const modules = {
    react,
    'react-native': { AppState: { addEventListener: (_, callback) => { appListeners.push(callback); return { remove() {} }; } } },
    '../lib/supabase': { supabase: { from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) } },
    '../lib/students': { fetchStudents: async () => [{ id: 's1' }] },
    '../lib/staff': { fetchStaff: async () => [{ id: 't1' }] },
    '../lib/duties': {
      fetchDuties: day => { const request = deferred(); requests.push({ ...request, day }); return request.promise; },
      fetchAttendance: id => marks.get(id)?.promise || Promise.resolve({}),
      resolveGroup: (_, students) => students,
      submitDuty: async () => ({ marked: 1 }),
    },
    '../lib/holidays': { fetchHoliday: async () => null },
    '../lib/leave': { fetchOpenLeaves: async () => ({}) },
    '../utils/format': { todayISO: () => today },
  };
  const file = path.resolve(__dirname, '../src/context/SchoolDataContext.js');
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => { assert.ok(modules[name], name); return modules[name]; },
    setInterval: () => 1, clearInterval() {},
  }, { filename: file });
  const render = () => { cursor = 0; return exports.SchoolDataProvider({ children: null }).props.value; };
  return { render, requests, marks, appListeners, effects, nextDay: () => { today = '2026-10-03'; } };
}

test('an older day response cannot replace a newer day or clear its loading state', async () => {
  const h = providerHarness();
  let value = h.render();
  const older = value.refresh();
  value.setDay('2026-10-03');
  value = h.render();
  const newer = value.refresh();
  h.requests[1].resolve([{ id: 'tomorrow', day: '2026-10-03', state: 'pending' }]);
  await newer;
  h.requests[0].resolve([{ id: 'yesterday', day: '2026-10-02', state: 'pending' }]);
  await older;
  value = h.render();
  assert.equal(value.duties[0].id, 'tomorrow');
  assert.equal(value.day, '2026-10-03');
});

test('a late failure cannot replace a successful refresh with an error', async () => {
  const h = providerHarness();
  const older = h.render().refresh();
  const newer = h.render().refresh();
  h.requests[1].resolve([{ id: 'fresh', state: 'pending' }]);
  await newer;
  h.requests[0].reject(new Error('old failed request'));
  await older;
  assert.equal(h.render().error, null);
  assert.equal(h.render().duties[0].id, 'fresh');
});

test('submitted duties and their saved exceptions are published together', async () => {
  const h = providerHarness();
  const attendance = deferred();
  h.marks.set('submitted', attendance);
  const load = h.render().refresh();
  h.requests[0].resolve([{ id: 'submitted', state: 'submitted', submittedBy: 't1' }]);
  await tick();
  // A correction screen must not see a submitted duty with all marks missing.
  assert.equal(h.render().duties.length, 0);
  attendance.resolve({ s1: 'A' });
  await load;
  const value = h.render();
  assert.equal(value.duties[0].id, 'submitted');
  assert.equal(value.records.submitted.statuses.s1, 'A');
});

test('returning from background reloads the register, and midnight advances the selected day', async () => {
  const h = providerHarness();
  h.render();
  h.effects.splice(0).forEach(effect => effect());
  h.requests.forEach(request => request.resolve([]));
  await tick();
  const before = h.requests.length;
  h.appListeners.forEach(listener => listener('background'));
  assert.equal(h.requests.length, before);
  h.appListeners.forEach(listener => listener('active'));
  assert.ok(h.requests.length > before, 'Foreground should re-read pending and submitted duties');
  h.requests.forEach(request => request.resolve([]));
  await tick();
  h.nextDay();
  h.appListeners.forEach(listener => listener('active'));
  assert.equal(h.render().day, '2026-10-03');
  h.effects.splice(0).forEach(effect => effect());
  assert.equal(h.requests.at(-1).day, '2026-10-03');
  h.requests.forEach(request => request.resolve([]));
  await tick();
});

test('a refresh started before submission cannot erase the successful local submission', async () => {
  const h = providerHarness();
  const duty = { id: 'today', day: '2026-10-02', state: 'pending' };
  const initial = h.render().refresh();
  h.requests[0].resolve([duty]);
  await initial;
  const value = h.render();
  const staleRefresh = value.refresh();
  await value.submitDuty('today', { s1: 'A' }, 't1');
  h.requests[1].resolve([duty]);
  await staleRefresh;
  assert.equal(h.render().duties[0].state, 'submitted');
  assert.equal(h.render().records.today.statuses.s1, 'A');
});
