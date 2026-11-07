/* Browser-only UI. No fetch, telemetry, remote fonts, or file transmission. */
(function () {
  'use strict';
  const core = window.EbirdConverter;
  if (!core) return;
  const $ = id => document.getElementById(id);
  const STORE = 'uioiu-ebird-name-rules-v1';
  const MAX_FILE = 5 * 1024 * 1024;
  let activeRules = Object.assign(Object.create(null), core.DEFAULT_MAPPINGS);
  let files = [], generation = 0, dirty = false;
  let confirmed = Object.create(null);
  const downloads = new Map();
  function node(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function status(id, message, error = false) {
    const n = $(id); n.textContent = message; n.classList.toggle('error', error);
  }
  function clearResults() { generation++; $('results').replaceChildren(); $('batch-download').replaceChildren(); $('batch-download').hidden = true; }
  function setDirty() {
    dirty = true; clearResults();
    status('mapping-status', '规则有修改，点击“应用规则并检查文件”后再下载。');
    if (files.length) status('batch-status', '旧预览已失效。请应用当前规则，重新检查。');
  }
  function row(from, to) {
    const wrap = node('div', undefined, 'map-row');
    const a = document.createElement('input'), b = document.createElement('input');
    a.value = from; b.value = to; a.maxLength = b.maxLength = 80;
    a.setAttribute('aria-label', '输入鸟名' + (from ? '：' + from : '（新增）'));
    b.setAttribute('aria-label', '输出鸟名' + (from ? '：' + from : '（新增）'));
    a.autocomplete = b.autocomplete = 'off';
    const kind = node('span', core.DEFAULT_MAPPINGS[from] === to ? '原手工经验规则' : '自定义，需确认', 'rule-kind');
    const remove = node('button', '删除'); remove.type = 'button'; remove.setAttribute('aria-label', '删除对应' + (from ? '：' + from : '（新增）'));
    [a, b].forEach(input => input.addEventListener('input', () => { kind.textContent = '已修改，需确认'; setDirty(); }));
    remove.addEventListener('click', () => { wrap.remove(); updateCount(); setDirty(); });
    wrap.append(a, node('span', '→', 'arr'), b, kind, remove); return wrap;
  }
  function filterRules() {
    const q = $('rule-search').value.trim().toLowerCase(); let shown = 0;
    for (const wrap of $('mapping-rows').children) {const visible = [...wrap.querySelectorAll('input')].some(input => input.value.toLowerCase().includes(q)); wrap.hidden = !visible; if (visible) shown++;}
    $('search-status').textContent = q ? '找到 ' + shown + ' 条' : '';
  }
  function updateCount() { $('mapping-count').textContent = $('mapping-rows').children.length + ' 条规则'; filterRules(); }
  function drawRules(rules) {
    $('mapping-rows').replaceChildren(...Object.entries(rules).map(([a,b]) => row(a,b))); updateCount();
  }
  function validateRules(rules, maxEntries = 500) {
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw Error('规则须为“输入中文名: 输出中文名”的 JSON 对象。');
    const entries = Object.entries(rules);
    if (entries.length > maxEntries) throw Error('名称记录超过数量限制：' + maxEntries + ' 条。');
    const result = Object.create(null);
    for (const [a,b] of entries) {
      if (typeof b !== 'string' || !/^[\u3400-\u9fff·•]{1,80}$/.test(a) || !/^[\u3400-\u9fff·•]{1,80}$/.test(b)) throw Error('每条规则的输入和输出都须为完整中文鸟名（最多 80 字），不能留空或包含公式、注释。');
      result[a] = b;
    }
    return result;
  }
  function readRules() {
    const result = Object.create(null);
    for (const wrap of $('mapping-rows').children) {
      const [a,b] = wrap.querySelectorAll('input'); const source = a.value.trim(), target = b.value.trim();
      if (Object.prototype.hasOwnProperty.call(result, source)) throw Error('输入名称重复：' + source + '。每个输入名称只能有一条规则。');
      result[source] = target;
    }
    return validateRules(result);
  }
  function persist() {
    const remembered = Object.entries(confirmed);
    if (remembered.length > 20000) confirmed = Object.assign(Object.create(null), Object.fromEntries(remembered.slice(-20000)));
    localStorage.setItem(STORE, JSON.stringify({version:1,mappings:activeRules,confirmed}));
  }
  function acceptRules() {
    activeRules = readRules(); dirty = false;
    try {persist(); status('mapping-status', '已应用并自动保存 ' + Object.keys(activeRules).length + ' 条规则，下次打开会自动恢复。');}
    catch(e) {status('mapping-status', '规则已应用，但此浏览器无法保存。请导出 JSON 备份，下次需重新导入。', true);}
  }
  function saveBlob(data, name, type) {
    const blob = new Blob([data], {type}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.hidden = true;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function uniqueFilename(result) {
    const base = core.filename(result); const n = (downloads.get(base) || 0) + 1; downloads.set(base, n);
    return n === 1 ? base : base.replace(/\.xlsx$/, '-' + n + '.xlsx');
  }
  function renderResult(file, result, error, token) {
    const card = node('article', undefined, 'result' + (error ? ' failed' : ''));
    card.append(node('h4', file.name));
    if (error) {card.append(node('p', '未生成结果：' + error.message, 'status error')); $('results').append(card); return;}
    card.append(node('p', result.date + ' · ' + result.location + ' · ' + result.records.length + ' 种', 'summary'));
    const mapped = result.records.filter(r => Object.prototype.hasOwnProperty.call(activeRules, r.sourceName));
    const retained = result.records.length - mapped.length;
    card.append(node('p', mapped.length + ' 种使用名称对应，' + retained + ' 种原样保留。未命中规则不代表已获目标平台认可；请核对全部输出。', 'notice'));
    if (result.skipped) card.append(node('p', '已跳过 ' + result.skipped + ' 条含“未识别”的记录。', 'notice'));
    if (result.unknown) card.append(node('p', result.unknown + ' 条 X / 空数量保持空白，未改成 0 或 1。导入前必须核对或补充。', 'notice'));
    if (!result.hasCount) card.append(node('p', '缺少数量列，本文件仅输出中文名；目标平台可能拒绝导入。请先核对数量要求。', 'notice'));
    const wrap = node('div', undefined, 'preview-wrap'), table = node('table', undefined, 'preview');
    const head = node('thead'), hr = node('tr');
    ['输入名称', '输出名称', '数量', '处理说明'].forEach(v => hr.append(node('th', v))); head.append(hr); table.append(head);
    const body = node('tbody');
    // The entire conversion stays in memory; large previews are capped to protect rendering.
    result.records.slice(0, 300).forEach(record => {
      const tr = node('tr'); tr.append(node('td', record.rawName), node('td', record.name), node('td', !result.hasCount ? '无数量列' : record.count === null ? '空白（需核对）' : String(record.count)));
      const hasRule = Object.prototype.hasOwnProperty.call(activeRules, record.sourceName);
      const remembered = confirmed[record.sourceName] === record.name;
      const label = remembered ? '已记住此对应' : hasRule ? core.DEFAULT_MAPPINGS[record.sourceName] === activeRules[record.sourceName] ? '经验对应 · 待核对' : '自定义对应 · 待核对' : '原样保留 · 未验证';
      const td = node('td'); td.append(node('span', label, 'rule-tag' + (hasRule ? '' : ' unmapped'))); tr.append(td); body.append(tr);
    });
    table.append(body); wrap.append(table); card.append(wrap);
    if (result.records.length > 300) card.append(node('p', '页面仅预览前 300 行。Excel 包含全部 ' + result.records.length + ' 行，请下载后完整核对。', 'notice'));
    const allRemembered = result.records.every(r => confirmed[r.sourceName] === r.name);
    const label = node('label', undefined, 'review-label'), checked = document.createElement('input'); checked.type = 'checkbox';
    checked.checked = allRemembered && result.hasCount && !result.unknown; 
    label.append(checked, node('span', allRemembered ? '本次含未知或缺失数量，我会在导入前按目标平台要求核对补充。' : '我已核对本次新增或修改的鸟名对应，并会在导入前检查数量。记住这些对应。'));
    label.hidden = allRemembered && result.hasCount && !result.unknown;
    const download = node('button', '下载 Excel (.xlsx)', 'primary'); download.type = 'button'; download.disabled = !checked.checked;
    if (allRemembered) card.append(node('p', '本清单的鸟名对应已记住，无需重新选择。' + (result.unknown || !result.hasCount ? '本次数量仍需确认。' : '下载前仍请检查本次数量与清单。'), 'hint'));
    checked.addEventListener('change', () => { download.disabled = !checked.checked || dirty; });
    const downloadStatus = node('p', '', 'download-note');
    download.addEventListener('click', () => {
      if (!checked.checked || dirty || token !== generation) return;
      download.disabled = true;
      try {
        const bytes = core.buildXlsx(result);
        result.records.forEach(r => {confirmed[r.sourceName] = r.name;});
        let remembered = true; try {persist();} catch(e) {remembered = false;}
        saveBlob(bytes, uniqueFilename(result), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); downloadStatus.textContent = '已发起下载。' + (remembered ? '已记住鸟名对应，下次自动使用。' : '浏览器保存失败，请导出规则备份。') + '日期和地点仍需在平台核对填写。'; }
      catch (e) { downloadStatus.textContent = '生成失败：' + e.message; }
      finally { download.disabled = false; }
    });
    card.append(label, download, downloadStatus); $('results').append(card);
  }
  async function processFiles() {
    if (dirty) { status('batch-status', '请先应用修改后的规则。', true); return; }
    clearResults(); const token = generation; const selected = [...files];
    if (!selected.length) { status('batch-status', '请选择文件，或先用合成示例试试。'); return; }
    let ok = 0, failed = 0; const outcomes = [];
    status('batch-status', '正在本机检查 ' + selected.length + ' 个文件…');
    for (let i = 0; i < selected.length; i++) {
      if (token !== generation) return;
      const file = selected[i];
      try {
        if (!/\.(csv|tsv)$/i.test(file.name)) throw Error('只支持 .csv 或 .tsv 文件。');
        if (file.size > MAX_FILE) throw Error('文件超过 5 MB，请拆分为单次清单或使用下载版。');
        const bytes = await file.arrayBuffer();
        if (token !== generation) return;
        const parsed = core.parseRecords(core.decodeUtf8(new Uint8Array(bytes)), activeRules);
        renderResult(file, parsed, null, token); outcomes.push({file, result:parsed}); ok++;
      } catch (e) { if (token !== generation) return; renderResult(file, null, e, token); outcomes.push({file, error:e.message}); failed++; }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (token === generation) {status('batch-status', '检查完成：' + ok + ' 个可下载，' + failed + ' 个失败。可批量打包，也可分别下载。', failed > 0); if (ok && selected.length > 1) renderBatch(outcomes, token);}
  }
  function renderBatch(outcomes, token) {
    const box = $('batch-download'); box.hidden = false; box.className = 'result';
    const successes = outcomes.filter(o => o.result), failures = outcomes.filter(o => o.error);
    box.append(node('h3', '批量下载 · ' + successes.length + ' 份独立 Excel'));
    box.append(node('p', 'ZIP 中每个文件对应一份清单，不合并记录；另附处理报告。' + (failures.length ? failures.length + ' 个失败文件不生成 Excel，原因见下方和报告。' : ''), 'hint'));
    const already = successes.every(o => o.result.hasCount && !o.result.unknown && o.result.records.every(r => confirmed[r.sourceName] === r.name));
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = already;
    const label = node('label', undefined, 'review-label'); label.hidden = already;
    label.append(check, node('span', '我已核对成功清单中的新鸟名对应，并会在导入前检查各份清单的数量。记住这些对应。'));
    const button = node('button', '打包下载 ' + successes.length + ' 份 Excel (.zip)', 'primary'); button.type = 'button'; button.disabled = !already;
    check.addEventListener('change', () => {button.disabled = !check.checked || dirty;});
    const message = node('p', already ? '全部鸟名对应已记住，无需重复选择。请仍核对每份清单的数量。' : '', 'hint');
    button.addEventListener('click', async () => {
      if (dirty || token !== generation || !check.checked) return;
      button.disabled = true; message.textContent = '正在本机打包…';
      const entries = [], names = new Map(), report = ['eBird 浏览器转换处理报告', '成功：' + successes.length + '；失败：' + failures.length, '文件未上传；鸟名仍应按目标平台核对。', ''];
      try {
        for (const item of outcomes) {
          if (token !== generation || dirty) return;
          if (item.error) {report.push('失败 | ' + item.file.name + ' | ' + item.error); continue;}
          const r = item.result, base = core.filename(r), n = (names.get(base) || 0) + 1; names.set(base, n);
          const name = n === 1 ? base : base.replace(/\.xlsx$/, '-' + n + '.xlsx');
          entries.push({name,data:core.buildXlsx(r)});
          report.push('成功 | ' + item.file.name + ' → ' + name + ' | 跳过未识别 ' + r.skipped + '；未知数量 ' + r.unknown + (r.hasCount ? '' : '；缺少数量列'));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (token !== generation || dirty) return;
        entries.push({name:'处理报告.txt',data:report.join('\n')});
        const bytes = core.buildZip(entries);
        successes.forEach(o => o.result.records.forEach(r => {confirmed[r.sourceName] = r.name;}));
        let remembered = true; try {persist();} catch(e) {remembered = false;}
        saveBlob(bytes, 'eBird-转换结果-' + successes.length + '份.zip', 'application/zip');
        message.textContent = '已发起 ZIP 下载。' + (remembered ? '已记住鸟名对应。' : '浏览器保存失败，请导出规则备份。') + '失败文件不会混入 Excel。';
      } catch(e) {message.textContent = '打包失败：' + e.message;}
      finally {if (token === generation) button.disabled = !check.checked || dirty;}
    });
    box.append(label,button,message);
  }
  function selectFiles(list) {
    clearResults();
    if (list.length > 50) { files = []; status('batch-status', '一次最多 50 个文件，请减少后重试。', true); return; }
    files = [...list]; processFiles();
  }
  $('rule-search').addEventListener('input', filterRules);
  $('add-rule').addEventListener('click', () => {if ($('mapping-rows').children.length >= 500) {status('mapping-status','规则最多 500 条。',true); return;} const r = row('', ''); $('rule-search').value = ''; $('mapping-rows').append(r); updateCount(); setDirty(); r.querySelector('input').focus();});
  $('apply-rules').addEventListener('click', () => {try {acceptRules(); processFiles();} catch(e) {status('mapping-status', e.message, true);}});
  $('reset-rules').addEventListener('click', () => {drawRules(core.DEFAULT_MAPPINGS); setDirty(); status('mapping-status', '已恢复原 12 条，请应用。应用后会自动保存为原 12 条规则。');});
  $('save-rules').addEventListener('click', () => {try {const rules = readRules(); localStorage.setItem(STORE, JSON.stringify({version:1,mappings:rules,confirmed})); status('mapping-status', '已将当前规则保存到此浏览器。没有保存地点、日期或数量。' + (dirty ? '请应用规则后转换。' : ''));} catch(e) {status('mapping-status', '未保存：' + e.message, true);}});
  $('forget-rules').addEventListener('click', () => {try {localStorage.removeItem(STORE); confirmed = Object.create(null); status('mapping-status', '已清除保存的规则与确认记录；当前页面仍保留编辑。再次应用或下载会重新记住。');} catch(e) {status('mapping-status','无法清除：' + e.message,true);}});
  $('export-rules').addEventListener('click', () => {try {saveBlob(JSON.stringify({version:1,mappings:readRules(),confirmed}, null, 2), 'ebird-name-rules.json', 'application/json'); status('mapping-status','已发起规则下载，不含观鸟记录。');} catch(e) {status('mapping-status',e.message,true);}});
  $('import-rules').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {if (file.size > 12 * 1024 * 1024) throw Error('规则文件不能超过 12 MB。'); const value = JSON.parse(core.decodeUtf8(new Uint8Array(await file.arrayBuffer()))); if (value.version !== undefined && value.version !== 1) throw Error('不支持此规则文件版本。'); const rules = validateRules(value.mappings === undefined ? value : value.mappings); confirmed = value.confirmed ? validateRules(value.confirmed, 20000) : Object.create(null); drawRules(rules); setDirty(); status('mapping-status','已导入规则。请检查并应用，之后会自动记住。');} catch(e) {status('mapping-status','导入失败：' + e.message,true);} finally {event.target.value = '';}
  });
  $('checklist-files').addEventListener('change', e => selectFiles(e.target.files));
  const zone = $('drop-zone');
  zone.addEventListener('dragover', e => {e.preventDefault(); zone.classList.add('dragging');});
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {e.preventDefault(); zone.classList.remove('dragging'); $('checklist-files').value = ''; selectFiles(e.dataTransfer.files);});
  $('demo').addEventListener('click', () => {$('checklist-files').value = ''; const csv = '鸟种,观察日期,地点,数量\n金斑鸻 Pacific Golden-Plover,2026-11-07,合成示例地点,3\n须浮鸥,2026-11-07,合成示例地点,X\n麻雀,2026-11-07,合成示例地点,5\n未识别鸟种,2026-11-07,合成示例地点,1\n'; selectFiles([new File([csv], '合成示例.csv', {type:'text/csv'})]);});
  $('clear-files').addEventListener('click', () => {files = []; $('checklist-files').value = ''; clearResults(); status('batch-status','已清空当前页面中的文件和预览。规则未改变。');});
  try { const saved = localStorage.getItem(STORE); if (saved) {const parsed = JSON.parse(saved); if (parsed.version !== 1) throw Error('旧规则版本不支持'); activeRules = validateRules(parsed.mappings); confirmed = parsed.confirmed ? validateRules(parsed.confirmed, 20000) : Object.create(null); status('mapping-status','已加载你在此浏览器保存的规则，请检查是否仍适用。');} else status('mapping-status','当前使用原工具的 12 条手工经验规则；尚未保存到浏览器。'); }
  catch(e) {activeRules = Object.assign(Object.create(null), core.DEFAULT_MAPPINGS); confirmed = Object.create(null); status('mapping-status','无法读取已保存规则，当前使用原 12 条。浏览器保存功能可能不可用。',true);}
  drawRules(activeRules); $('web-app').hidden = false;
})();
