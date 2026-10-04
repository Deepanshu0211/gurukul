const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const babel=require('@babel/core');
const exportsHtml={};
vm.runInNewContext(babel.transformSync(fs.readFileSync('src/lib/reportHtml.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code,{exports:exportsHtml,require:()=>({fmtTime:()=> '6:15 AM',fmtDay:x=>x,fmtDayNumeric:x=>x,weekdayOf:()=> 'Sunday',plural:(n,s)=>`${n} ${s}`})});
const checkpoints=[10,11,12,3,4,5,6,7,8,9].map(n=>({day:'2026-10-04',group:`Class ${n}`,name:'Physical Activity',startMin:375,strength:20,present:19,absent:1,elsewhere:0,takenBy:'Teacher sir',submittedAt:'2026-10-04T01:05:00Z'}));
const exceptions=Array.from({length:90},(_,i)=>({roll_no:1000+i,student:`STUDENT ${i}`,grade:10,section:i%2?'BALRAM':'KRISHNA',checkpoint:'Physical Activity',status:'A',status_label:'Absent'}));
const data={from:'2026-10-04',to:'2026-10-04',days:['2026-10-04'],checkpoints,exceptions,totals:{strength:200,present:190,absent:10,elsewhere:0},byReason:[]};
test('headcount prints classes numerically without mutating source order',()=>{const original=checkpoints.map(c=>c.group);const html=exportsHtml.headcountReportHtml(data);const labels=[...html.matchAll(/<td[^>]*>Class (\d+)<\/td>/g)].map(m=>Number(m[1]));assert.deepEqual(labels,[3,4,5,6,7,8,9,10,11,12]);assert.deepEqual(checkpoints.map(c=>c.group),original);});
test('report includes sample heading, submission metadata and full section names',()=>{const html=exportsHtml.headcountReportHtml(data);for(const text of ['Vrindaranyam','Filled by','Submitted at','MOD / Incharge','Principal','10 Krishna','10 Balram','student-details'])assert.ok(html.includes(text),text);assert.ok(!html.includes('KRISH…'));});
if(process.env.PRINT_PREVIEW_PATH)fs.writeFileSync(process.env.PRINT_PREVIEW_PATH,exportsHtml.headcountReportHtml(data,{generatedBy:'Coordinator'}));

test('report text preserves UTF-8 separators',()=>{const html=exportsHtml.headcountReportHtml(data);assert.ok(!html.includes("\u00c2\u00b7"));assert.ok(html.includes("\u00b7"));});

test('multiple activities retain an activity label on each summary row',()=>{const report={...data,checkpoints:[{...checkpoints[0],name:'Breakfast prasadam'},{...checkpoints[1],name:'Morning attendance'}]};const html=exportsHtml.headcountReportHtml(report);assert.ok(html.includes('>Activity</th>'));assert.ok(html.includes('>Breakfast prasadam</td>'));assert.ok(html.includes('>Morning attendance</td>'));assert.ok(html.includes('colspan="5"'));});
