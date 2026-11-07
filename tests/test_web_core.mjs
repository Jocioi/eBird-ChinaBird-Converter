// Synthetic fixtures only. Run with Node; optional PYTHON env enables differential/XLSX checks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const core = require('../website/converter-core.js');
const header = ['鸟种','数量','观察日期','地点'];
const row = ['金斑鸻 Pacific Golden-Plover','3','2026-11-07','测试地点'];
const quote = (value, delimiter) => /["\r\n]/u.test(value) || value.includes(delimiter) ? '"' + value.replaceAll('"','""') + '"' : value;
const fixture = (rows = [row], headers = header, delimiter = ',', bom = false) => (bom ? '\uFEFF' : '') + [headers, ...rows].map(r => r.map(v => quote(v, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
const cases = [];
function check(text, valid = true, mappings) {
  cases.push({text, valid, mappings});
  if (valid) return core.parseRecords(text, mappings);
  assert.throws(() => core.parseRecords(text, mappings));
}
for (const delimiter of [',','\t',';']) for (const bom of [false,true]) {
  const out = check(fixture(undefined, undefined, delimiter, bom));
  assert.deepEqual(out.records, [{name:'金鸻',count:3,rawName:row[0],sourceName:'金斑鸻',line:2}]);
  assert.equal(out.date, '20261107'); assert.equal(out.location, '测试地点');
}
for (const date of ['2024-02-29','2024/02/29','2024.02.29 12:30:00','2024-2-9','2024-2-9 1:2:3']) check(fixture([[row[0],'3',date,row[3]]]));
for (const date of ['', '2025-02-29','2026-13-01','11/07/2026','2026-11-07 garbage','0000-01-01','2026-11-07 24:00:00','2026-11/07']) check(fixture([[row[0],'3',date,row[3]]]), false);
for (const count of ['X','x','']) { const result = check(fixture([[row[0],count,row[2],row[3]]])); assert.equal(result.records[0].count,null); assert.equal(result.unknown,1); }
for (const count of ['-1','0','1.5','=1+2','+2','1,000','1000000000000000','１','Infinity']) check(fixture([[row[0],count,row[2],row[3]]]), false);
for (const count of ['00001','999999999999999']) check(fixture([[row[0],count,row[2],row[3]]]));
for (const name of ['Pacific Golden-Plover','=HYPERLINK(中文)','金斑鸻/灰斑鸻','']) check(fixture([[name,...row.slice(1)]]), false);
for (const name of ['金斑鸻（注释）','金斑鸻(注释)','金斑鸻[注释]','测试金斑鸻']) check(fixture([[name,...row.slice(1)]]));
for (const h of [[],['鸟种','鸟种','观察日期','地点'],['鸟种','','观察日期','地点'],['Common Name','数量','观察日期','地点']]) check(fixture([row],h),false);
check(fixture([]),false); check(fixture([row.slice(0,3)]),false); check(fixture([[...row,'extra']]),false);
check('鸟种,数量,观察日期,地点\n"unterminated',false);
check('鸟种,数量,观察日期,地点\n"金斑鸻"bad,3,2026-11-07,测试',false);
for (const [index,value] of [[2,'2026-11-08'],[3,'另一地点'],[0,'金鸻'],[3,'']]) { const other=[...row]; other[index]=value; check(fixture([row,other]),false); }
for (const key of ['开始时间','Submission ID']) {
  check(fixture([[...row,'A'],['灰斑鸻',...row.slice(1),'B']],[...header,key]),false);
  check(fixture([[...row,'A'],['灰斑鸻',...row.slice(1),'A']],[...header,key]));
}
const skipped = check(fixture([row,['未识别鸟种','invalid',row[2],row[3]]])); assert.equal(skipped.skipped,1);
check(fixture([['未识别鸟种','invalid','bad',row[3]],row]),false);
check(fixture([['未识别鸟种','invalid',row[2],row[3]]]),false);
// Deliberately stricter than Python v1.5.1: uncertain suffixes are never discarded.
for (const name of ['灰斑鸻 hybrid', '灰斑鸻 sp.', '灰斑鸻 spuh', '灰斑鸻 x 金斑鸻', '灰斑鸻（不确定）', '灰斑鸻 / 金斑鸻', '灰斑鸻？', '灰斑鸻×金斑鸻'])
  assert.throws(() => core.parseRecords(fixture([[name,...row.slice(1)]])));
const noCount = check(fixture([['灰斑鸻',row[2],'测试,地点"甲']],['鸟种','观察日期','地点'])); assert.equal(noCount.hasCount,false);
const multiline = check(fixture([[row[0],'3',row[2],'测试\n地点']])); assert.equal(multiline.records[0].line,3);
check(fixture() + '\n,,,\n');
assert.equal(Object.keys(core.DEFAULT_MAPPINGS).length,12);
assert.equal(check(fixture(),true,{}).records[0].name,'金斑鸻');
assert.equal(check(fixture(),true,{'金斑鸻':'测试鸟'}).records[0].name,'测试鸟');
assert.throws(() => core.parseRecords(fixture(),{'金斑鸻':'=HYPERLINK("bad")'}));
assert.throws(() => core.parseRecords(fixture(),{'金斑鸻':''}));
check(fixture([row,['灰斑鸻',...row.slice(1)]]),false,{'金斑鸻':'鸟','灰斑鸻':'鸟'});
assert.throws(() => core.decodeUtf8(Uint8Array.from([0xc3,0x28])));
assert.equal(core.decodeUtf8(new TextEncoder().encode('\uFEFF鸟种')), '鸟种');
assert.equal(core.sanitizeLocation(' .a/b:c*?"<>|\u0001. '),'a-b-c-------');
assert.ok(new TextEncoder().encode(core.sanitizeLocation('测试地点'.repeat(40))).length <= 180);
assert.equal(core.sanitizeLocation(' . '),'地点');
assert.equal(core.filename(check(fixture())), '20261107-测试地点-1.xlsx');
assert.equal(core.filename(check(fixture()),2), '20261107-测试地点-1-2.xlsx');
const formula = {records:[{name:'=HYPERLINK("https://invalid")',count:null}], hasCount:true};
const exports = [check(fixture()), noCount, check(fixture([[row[0],'X',row[2],row[3]]])), formula];
for (const out of exports) assert.ok(core.buildXlsx(out) instanceof Uint8Array);
const archiveEntries = exports.map((r,i) => ({name:`合成清单-${i + 1}.xlsx`,data:core.buildXlsx(r)}));
archiveEntries.push({name:'说明.txt',data:'合成测试，不含真实记录。'});
const batchArchive = core.buildZip(archiveEntries);
assert.ok(batchArchive instanceof Uint8Array);
for (const name of ['', '../bad.xlsx', '/bad.xlsx', 'a/b.xlsx', 'a\\b.xlsx', 'C:bad.xlsx', 'bad\u0000.xlsx', '.', '..', ' trailing.xlsx', 'trailing.'])
  assert.throws(() => core.buildZip([{name,data:'test'}]));
assert.throws(() => core.buildZip([{name:'a.xlsx',data:''},{name:'A.xlsx',data:''}]));
assert.throws(() => core.buildZip([{name:'é.txt',data:''},{name:'e\u0301.txt',data:''}]));
assert.throws(() => core.buildZip([{name:'x.txt',data:{}}]));
assert.throws(() => core.buildZip([{name:'长'.repeat(22000),data:''}]));
if (process.env.PYTHON) {
  const script = `import sys,json,tempfile,base64,io,zipfile\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nimport ebird_converter as app\nfrom openpyxl import load_workbook\npayload=json.load(sys.stdin)\nfor i,case in enumerate(payload['cases']):\n app.CUSTOM_NAME_MAP=case.get('mappings',payload['defaults'])\n with tempfile.TemporaryDirectory() as tmp:\n  path=Path(tmp)/'synthetic.csv';path.write_bytes(case['text'].encode('utf-8'))\n  try:\n   result=app.read_records(path)\n  except Exception:\n   assert not case['valid'], ('Python rejected',i,case)\n  else:\n   assert case['valid'], ('Python accepted',i,case)\n   assert json.loads(json.dumps(result))==case['expected'], (i,result,case['expected'])\nfor data in payload['exports']:\n raw=base64.b64decode(data['bytes'])\n with zipfile.ZipFile(io.BytesIO(raw)) as z:\n  assert z.testzip() is None\n  assert b'<f>' not in z.read('xl/worksheets/sheet1.xml')\n wb=load_workbook(io.BytesIO(raw)); ws=wb.active\n assert ws.title=='导入数据'\n assert [list(r) for r in ws.values]==data['cells']\n assert ws['A1'].font.bold\n assert ws['A2'].data_type=='s'\n wb.close()\nwith zipfile.ZipFile(io.BytesIO(base64.b64decode(payload['batch']))) as z:\n assert z.testzip() is None\n assert z.namelist()==['合成清单-'+str(i+1)+'.xlsx' for i in range(4)]+['说明.txt']\n assert z.read('说明.txt').decode('utf-8')=='合成测试，不含真实记录。'\n for i, info in enumerate(z.infolist()):\n  assert info.flag_bits & 0x800\n  if info.filename.endswith('.xlsx'):\n   wb=load_workbook(io.BytesIO(z.read(info.filename)))\n   assert [list(r) for r in wb.active.values]==payload['exports'][i]['cells']\n   wb.close()\nprint('Python differential, ZIP batch, and openpyxl XLSX checks passed')`;
  const payload = {batch:Buffer.from(batchArchive).toString('base64'),defaults:core.DEFAULT_MAPPINGS,cases:cases.map(c => {
    if (!c.valid) return c;
    const r = core.parseRecords(c.text,c.mappings);
    return {...c,expected:[r.records.map(x => [x.name,x.count]),r.date,r.location,r.hasCount,r.skipped,r.unknown]};
  }),exports:exports.map(r => ({bytes:Buffer.from(core.buildXlsx(r)).toString('base64'),cells:[r.hasCount ? ['中文名','数量'] : ['中文名'],...r.records.map(x => r.hasCount ? [x.name,x.count] : [x.name])]}))};
  const p=spawnSync(process.env.PYTHON,['-c',script,fileURLToPath(new URL('..',import.meta.url))],{input:JSON.stringify(payload),encoding:'utf8'});
  assert.equal(p.status,0,p.stdout+p.stderr); process.stdout.write(p.stdout);
}
console.log(`Browser core tests passed (${cases.length} synthetic parse cases).`);
