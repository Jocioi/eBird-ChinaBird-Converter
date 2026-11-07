// Minimal deterministic DOM harness: exercises state logic, not browser layout/accessibility.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), core = require('../website/converter-core.js');
const script = readFileSync(new URL('../website/web.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../website/index.html',import.meta.url),'utf8');
const STORE='uioiu-ebird-name-rules-v1';
class Element {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.value='';this.textContent='';this.hidden=false;this.checked=false;this.disabled=false;this.className='';this.attributes={};this.files=[];
    this.classList={add:()=>{},remove:()=>{},toggle:()=>{},contains:name=>this.className.split(' ').includes(name)};
  }
  append(...children) { for(const child of children) {this.children.push(child);child.parent=this;} }
  replaceChildren(...children) {this.children=[];this.append(...children);}
  remove() {if(this.parent) this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(name,value) {this.attributes[name]=value;}
  addEventListener(type,callback) {(this.listeners[type] ||= []).push(callback);}
  async fire(type,extra={}) {for(const callback of this.listeners[type] || []) await callback({target:this,preventDefault(){},...extra});}
  click() {if(!this.disabled) return this.fire('click');}
  focus() {}
  querySelectorAll(selector) {return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  matches(selector) { if(selector==='input') return this.tagName==='INPUT';if(selector==='button') return this.tagName==='BUTTON';if(selector==='input[type="checkbox"]') return this.tagName==='INPUT'&&this.type==='checkbox';if(selector.startsWith('.')) return this.classList.contains(selector.slice(1));return this.tagName===selector.toUpperCase();}
}
function setup(saved,blocked=false) {
  const ids=new Map([...html.matchAll(/\bid="([^"]+)"/gu)].map(m=>[m[1],new Element()]));
  const storage=new Map(saved===undefined?[]:[[STORE,typeof saved==='string'?saved:JSON.stringify(saved)]]),blobs=[];
  const document={getElementById:id=>{assert.ok(ids.has(id),'Missing fixture DOM id '+id);return ids.get(id);},createElement:tag=>new Element(tag),body:new Element('body')};
  const context={window:{EbirdConverter:core},document,localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value);},removeItem:key=>storage.delete(key)},Blob,File,TextEncoder,TextDecoder,Uint8Array,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:(callback,delay)=>{if(delay<1000)return setTimeout(callback,0);},console};
  vm.runInNewContext(script,context,{filename:'web.js'});
  return {ids,storage,blobs,get:id=>ids.get(id)};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,1));
async function until(test) {for(let i=0;i<300;i++){if(test())return;await tick();}assert.fail('Timed out waiting for UI state');}
const csv=name=>`鸟种,数量,观察日期,地点\n${name},3,2026-11-07,合成地点\n`;
const file=(name='麻雀',filename='synthetic.csv')=>new File([csv(name)],filename);
async function select(app,files) {app.get('checklist-files').files=files;await app.get('checklist-files').fire('change');}
async function completed(app) {await until(()=>app.get('batch-status').textContent.includes('检查完成'));}
async function downloadFirst(app) {const card=app.get('results').children[0];const checkbox=card.querySelector('input[type="checkbox"]');checkbox.checked=true;await checkbox.fire('change');await card.querySelector('button').click();}
// Applying an edit automatically saves it and clears obsolete previews.
const app=setup();assert.equal(app.get('mapping-rows').children.length,12);
await select(app,[file('金斑鸻')]);await completed(app);assert.equal(app.get('results').children.length,1);
let inputs=app.get('mapping-rows').children[0].querySelectorAll('input');inputs[1].value='测试鸟';await inputs[1].fire('input');assert.equal(app.get('results').children.length,0);
await app.get('apply-rules').click();await completed(app);assert.equal(JSON.parse(app.storage.get(STORE)).mappings['金斑鸻'],'测试鸟');
await downloadFirst(app);assert.equal(JSON.parse(app.storage.get(STORE)).confirmed['金斑鸻'],'测试鸟');assert.equal(app.blobs.length,1);
const restored=setup(app.storage.get(STORE));assert.equal(restored.get('mapping-rows').children[0].querySelectorAll('input')[1].value,'测试鸟');
await select(restored,[file('金斑鸻')]);await completed(restored);assert.equal(restored.get('results').children[0].querySelector('button').disabled,false);
// Confirmed species history may exceed the rule editor's 500-rule limit.
const names=Array.from({length:501},(_,i)=>'测试'+String.fromCharCode(0x4e00+i));
const history=Object.fromEntries(names.map(n=>[n,n]));
const many=setup({version:1,mappings:{},confirmed:history});assert.match(many.get('mapping-status').textContent,/已加载/);
await select(many,[file(names[500])]);await completed(many);assert.equal(many.get('results').children[0].querySelector('button').disabled,false);
await downloadFirst(many);assert.equal(Object.keys(JSON.parse(many.storage.get(STORE)).confirmed).length,501);
// Invalid stored history must never leave a partially applied mapping table.
for(const saved of ['{invalid',{version:1,mappings:{'金斑鸻':'测试鸟'},confirmed:{bad:'bad'}}]) {
  const invalid=setup(saved);assert.equal(invalid.get('mapping-rows').children.length,12);assert.equal(invalid.get('mapping-rows').children[0].querySelectorAll('input')[1].value,'金鸻');
}
// A blocked persistence API does not prevent local conversion.
const blocked=setup(undefined,true);await blocked.get('apply-rules').click();assert.match(blocked.get('mapping-status').textContent,/无法保存/);
await select(blocked,[file()]);await completed(blocked);await downloadFirst(blocked);assert.equal(blocked.blobs.length,1);
// Fifty files are allowed and invalid inputs don't suppress successful outputs.
const batch=setup();await select(batch,Array.from({length:50},(_,i)=>i%2?new File(['bad'],'bad.csv'):file('麻雀',`synthetic-${i}.csv`)));await completed(batch);
assert.equal(batch.get('results').children.length,50);assert.match(batch.get('batch-status').textContent,/25.*25/);
await select(batch,Array.from({length:51},()=>file()));assert.equal(batch.get('results').children.length,0);assert.match(batch.get('batch-status').textContent,/最多 50/);
// Resolving an obsolete file read after selecting a new batch must not append it.
const stale=setup();let resolveRead;
const slow={name:'old.csv',size:20,arrayBuffer:()=>new Promise(resolve=>{resolveRead=resolve;})};
await select(stale,[slow]);await select(stale,[file('麻雀','new.csv')]);await completed(stale);resolveRead(new TextEncoder().encode(csv('灰斑鸻')).buffer);await tick();
assert.equal(stale.get('results').children.length,1);assert.equal(stale.get('results').children[0].children[0].textContent,'new.csv');
// Changing a rule while a file read is in flight cancels it immediately.
const edit=setup();let finish;
await select(edit,[{name:'slow.csv',size:20,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})}]);
const input=edit.get('mapping-rows').children[0].querySelectorAll('input')[1];input.value='测试鸟';await input.fire('input');finish(new TextEncoder().encode(csv('金斑鸻')).buffer);await tick();assert.equal(edit.get('results').children.length,0);
// Batch download preserves independent workbooks, disambiguates names, and reports failures.
function unzipStored(buffer) {
  const bytes=Buffer.from(buffer), entries=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset+8),0);assert.ok(bytes.readUInt16LE(offset+6)&0x800);
    const length=bytes.readUInt32LE(offset+18), nameLength=bytes.readUInt16LE(offset+26), extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'), start=offset+30+nameLength+extraLength;
    assert.ok(!entries.has(name));entries.set(name,bytes.subarray(start,start+length));offset=start+length;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);return entries;
}
const zipped=setup();await select(zipped,[file('金斑鸻','first.csv'),file('灰斑鸻','second.csv'),new File(['bad'],'broken.csv')]);await completed(zipped);
const batchBox=zipped.get('batch-download');assert.equal(batchBox.hidden,false);const zipCheck=batchBox.querySelector('input[type="checkbox"]');zipCheck.checked=true;await zipCheck.fire('change');await batchBox.querySelector('button').click();
assert.equal(zipped.blobs.length,1);assert.equal(zipped.blobs[0].type,'application/zip');
const archive=unzipStored(await zipped.blobs[0].arrayBuffer());
assert.deepEqual([...archive.keys()],['20261107-合成地点-1.xlsx','20261107-合成地点-1-2.xlsx','处理报告.txt']);
assert.match(archive.get('处理报告.txt').toString('utf8'),/失败.*broken\.csv/);
assert.match(archive.get('处理报告.txt').toString('utf8'),/成功：2；失败：1/);
assert.match(unzipStored(archive.get('20261107-合成地点-1.xlsx')).get('xl/worksheets/sheet1.xml').toString('utf8'),/金鸻/);
assert.match(unzipStored(archive.get('20261107-合成地点-1-2.xlsx')).get('xl/worksheets/sheet1.xml').toString('utf8'),/灰鸻/);
assert.equal(JSON.parse(zipped.storage.get(STORE)).confirmed['灰斑鸻'],'灰鸻');
// Search matches both source and target, and adding a row reveals the new editor.
const search=setup();search.get('rule-search').value='金鸻';await search.get('rule-search').fire('input');
assert.equal(search.get('mapping-rows').children.filter(r=>!r.hidden).length,1);assert.equal(search.get('search-status').textContent,'找到 1 条');
search.get('rule-search').value='蒙古';await search.get('rule-search').fire('input');assert.equal(search.get('mapping-rows').children.filter(r=>!r.hidden).length,1);
search.get('rule-search').value='完全无匹配';await search.get('rule-search').fire('input');assert.equal(search.get('mapping-rows').children.filter(r=>!r.hidden).length,0);
await search.get('add-rule').click();assert.equal(search.get('rule-search').value,'');assert.equal(search.get('mapping-rows').children.length,13);assert.ok(search.get('mapping-rows').children.every(r=>!r.hidden));
// Valid backups larger than the old 100 KB threshold round-trip without losing rules.
const largeRules=Object.fromEntries(Array.from({length:500},(_,i)=>['测试'+String.fromCharCode(0x4e00+i)+'鸟'.repeat(70),'目标'+String.fromCharCode(0x4e00+i)+'鸟'.repeat(70)]));
const exportApp=setup({version:1,mappings:largeRules,confirmed:history});await exportApp.get('export-rules').click();assert.ok(exportApp.blobs[0].size>100*1024);
const importApp=setup();importApp.get('import-rules').files=[new File([exportApp.blobs[0]],'rules.json')];await importApp.get('import-rules').fire('change');assert.match(importApp.get('mapping-status').textContent,/已导入/);
await importApp.get('apply-rules').click();const roundtrip=JSON.parse(importApp.storage.get(STORE));assert.deepEqual(roundtrip.mappings,largeRules);assert.deepEqual(roundtrip.confirmed,history);
// Remembered names need no visible checkbox, but unknown quantities still require one.
const remembered=setup(zipped.storage.get(STORE));await select(remembered,[file('金斑鸻')]);await completed(remembered);
let rememberedCard=remembered.get('results').children[0];assert.equal(rememberedCard.querySelector('input[type="checkbox"]').parent.hidden,true);assert.equal(rememberedCard.querySelector('button').disabled,false);
await select(remembered,[new File([csv('金斑鸻').replace(',3,',',X,')],'unknown.csv')]);await completed(remembered);
rememberedCard=remembered.get('results').children[0];assert.equal(rememberedCard.querySelector('input[type="checkbox"]').parent.hidden,false);assert.equal(rememberedCard.querySelector('input[type="checkbox"]').checked,false);assert.equal(rememberedCard.querySelector('button').disabled,true);
await select(remembered,[file('金斑鸻'),file('灰斑鸻')]);await completed(remembered);assert.equal(remembered.get('batch-download').querySelector('input[type="checkbox"]').parent.hidden,true);assert.equal(remembered.get('batch-download').querySelector('button').disabled,false);
// Editing during asynchronous ZIP construction cancels the download.
const canceledZip=setup();await select(canceledZip,[file('金斑鸻'),file('灰斑鸻')]);await completed(canceledZip);
const cancelCheck=canceledZip.get('batch-download').querySelector('input[type="checkbox"]');cancelCheck.checked=true;await cancelCheck.fire('change');
const zipPending=canceledZip.get('batch-download').querySelector('button').click();const cancelInput=canceledZip.get('mapping-rows').children[0].querySelectorAll('input')[1];cancelInput.value='测试鸟';await cancelInput.fire('input');await zipPending;assert.equal(canceledZip.blobs.length,0);assert.equal(canceledZip.get('batch-download').hidden,true);
console.log('UI state tests passed: persistence, 501-species history, atomic fallback, blocked storage, mixed 50-file batch, cancellation, mapping invalidation, ZIP contents/collisions/failure report, search, large JSON round-trip, and remembered-name/unknown-count review.');
