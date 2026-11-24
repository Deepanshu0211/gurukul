// The bulk student import's file handling and row rules, offline.
//
//   node --test tests/student-import.test.cjs
//
// The server's side (migration 052) is tests/bulk-add-students.test.cjs.
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
    if (name === 'fflate') return require('fflate');
    return load(path.relative(root, path.resolve(path.dirname(file), name + '.js')));
  };
  vm.runInNewContext(code, { exports, require: requireModule, TextDecoder, TextEncoder }, { filename: file });
  return exports;
}

// Values built inside the vm sandbox have that realm's prototypes; compare as plain data.
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

const { parseCsv, toCsv } = load('src/utils/csv.js');
const { readXlsx, writeXlsx, looksLikeXlsx } = load('src/utils/xlsx.js');
const { draftsFromSheet, importContext, validateDrafts, templateHeader, importTally } = load('src/domain/studentImport.js');

const register = [
  { adm: 'S100', name: 'Om Malhotra', grade: 6, sec: 'KRISHNA', key: '6|KRISHNA', label: '6 Krishna', roll: 627 },
  { adm: 'S101', name: 'Asha Rao', grade: 4, sec: 'A', key: '4|A', label: '4 A', roll: 3 },
];

test('CSV: quotes, embedded commas and newlines, semicolons, BOM', () => {
  same(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  same(parseCsv('a;b\n1;"2;3"'), [['a', 'b'], ['1', '2;3']]);
  same(parseCsv('a,b\n"line\nbreak",2'), [['a', 'b'], ['line\nbreak', '2']]);
  same(parseCsv(toCsv([['Name', 'Note'], ['A, B', 'q"t']]).replace(/^﻿/, '')), [['Name', 'Note'], ['A, B', 'q"t']]);
});

test('XLSX: the template round-trips, and numbers come back as Excel shows them', () => {
  const bytes = writeXlsx({
    sheets: [
      { name: 'Students', rows: [templateHeader(), ['0123', 'Ravi & Sons <x>', 4, 'A', 'Residential', '', 12]], headerRow: true, textColumns: [0],
        validations: [{ col: 4, type: 'list', values: ['Residential', 'Day Scholar'] }], blankRows: 5 },
      { name: 'How to fill', rows: [['x']] },
    ],
  });
  assert.ok(looksLikeXlsx(bytes));
  const { rows, sheetName } = readXlsx(bytes);
  assert.equal(sheetName, 'Students');
  same(rows[1], ['0123', 'Ravi & Sons <x>', '4', 'A', 'Residential', '', '12']);
});

test('XLSX: shared strings, rich text, gaps and scientific notation from other exporters', () => {
  const { zipSync, strToU8 } = require('fflate');
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="3"><c r="A3"><v>2.0210215E8</v></c><c r="C3" t="s"><v>2</v></c></row>
  </sheetData></worksheet>`;
  const bytes = zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Reg" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Admission No</t></si><si><r><t>Student </t></r><r><t>Name</t></r></si><si><t>a&amp;b</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
  const { rows } = readXlsx(bytes);
  same(rows, [['Admission No', 'Student Name'], [], ['202102150', '', 'a&b']]);
});

test('header found under a title row; aliases; blank rows skipped; unknown columns reported', () => {
  const { drafts, ignored } = draftsFromSheet([
    ['Bhaktivedanta Gurukula — new admissions'],
    [],
    ['Adm. No', 'Name', 'Class', 'Sec', 'Type', 'Remarks'],
    ['S200', 'New Child', '4', 'a', 'R', 'x'],
    ['', '', '', '', '', ''],
    ['S201', 'Second Child', '4', 'A', 'Day Scholar', ''],
  ]);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].line, 4);
  assert.equal(drafts[0].values.admissionNo, 'S200');
  same(ignored, ['Remarks']);
  assert.match(draftsFromSheet([['foo', 'bar'], ['1', '2']]).problem, /column headings/);
  assert.match(draftsFromSheet([['Admission No', 'Student Name']]).problem, /no students/);
});

test('every rule a row can break, in words', () => {
  const ctx = importContext({ students: register, known: new Map([['S999', { name: 'Gone Kid', active: false }]]), mayStartClass: false });
  const rows = (vals) => draftsFromSheet([templateHeader(), ...vals]).drafts;
  const v = validateDrafts(rows([
    ['s300', 'Good Child', 'Class IV', 'a', 'res', 'vrindavan', ''],     // 0 ok
    ['S100', 'Dup Of Om', '6', 'Krishna', 'Residential', '', ''],        // 1 on register
    ['S999', 'Leaver Reuse', '4', 'A', 'Residential', '', ''],           // 2 leaver
    ['S301', 'Twin', '4', 'A', 'Residential', '', '7'],                  // 3 dup adm in file
    ['S301', 'Twin Two', '4', 'A', 'Residential', '', '7'],              // 4 dup adm + dup roll
    ['S302', 'X', '13', 'A', 'Weekly', 'Hogwarts', 'abc'],              // 5 many errors
    ['S303', 'New Class Kid', '4', 'Z', 'Day Scholar', '', ''],          // 6 new class, teacher
    ['S304', 'Roll Clash', '4A', '', 'Day Scholar', '', '3'],            // 7 4A split, roll clash warn
  ]), ctx);
  assert.equal(v[0].ok, true);
  assert.equal(v[0].clean.grade, 4);
  assert.equal(v[0].clean.section, 'A');
  assert.equal(v[0].clean.stype, 'Residential');
  assert.equal(v[0].clean.house, 'Vrindavan');
  assert.equal(v[0].clean.admissionNo, 'S300');
  assert.match(v[1].errors.admissionNo, /Already on the register: Om Malhotra, Class 6 Krishna/);
  assert.match(v[2].errors.admissionNo, /has left/);
  assert.match(v[3].errors.admissionNo, /Appears 2 times in this file \(rows 5, 6\)/);
  assert.match(v[4].warnings.join(" "), /Roll 7 is given to 2 students/);
  same(Object.keys(v[5].errors).sort(), ['grade', 'house', 'name', 'roll', 'stype']);
  assert.match(v[6].errors.section, /Only a coordinator can start a new class/);
  assert.equal(v[7].ok, true);
  assert.equal(v[7].clean.section, 'A');
  assert.match(v[7].warnings[0], /Roll 3 already belongs to Asha Rao/);
  same(importTally(v), { total: 8, ready: 2, fix: 6, warned: 3 });

  // A coordinator may start the class; it becomes a warning instead.
  const coord = validateDrafts(rows([['S303', 'New Class Kid', '4', 'Z', 'Day Scholar', '', '']]),
    importContext({ students: register, mayStartClass: true }));
  assert.equal(coord[0].ok, true);
  assert.equal(coord[0].newClass, true);
  assert.match(coord[0].warnings[0], /Starts a new class, 4 Z/);
});

test("a teacher's blank Grade and Section mean their own class", () => {
  const ctx = importContext({ students: register, ownClassKey: '6|KRISHNA' });
  const [r] = validateDrafts(draftsFromSheet([templateHeader(), ['S400', 'Mine', '', '', 'Residential', '', '']]).drafts, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.ownClass, true);
  assert.equal(r.classLabel, '6 Krishna');
  assert.equal(r.clean.section, 'KRISHNA');
  // Without an own class, it is missing information.
  const [m] = validateDrafts(draftsFromSheet([templateHeader(), ['S400', 'Mine', '', '', 'Residential', '', '']]).drafts, importContext({ students: register }));
  assert.ok(m.errors.grade && m.errors.section);
});

test('the real 415-student register file validates as ready on an empty school', () => {
  const csv = fs.readFileSync(path.join(root, 'docs/data/students_415.csv'), 'utf8');
  const { drafts } = draftsFromSheet(parseCsv(csv));
  assert.equal(drafts.length, 415);
  const v = validateDrafts(drafts, importContext({ students: [], mayStartClass: true }));
  const bad = v.filter((r) => !r.ok);
  // The real register really does put two children on roll 218 in 2 A: a warning, not a block.
  assert.equal(v.filter((r) => r.warnings.some((w) => /Roll 218/.test(w))).length, 2);
  same(bad.map((r) => [r.line, r.errors]), []);
});
