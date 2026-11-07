/* Local-only conversion core. No network, dependencies, or inferred taxonomy. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EbirdConverter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_MAPPINGS = Object.freeze({
    '金斑鸻': '金鸻', '灰斑鸻': '灰鸻', '白冠燕尾': '白额燕尾',
    '须浮鸥': '灰翅浮鸥', '理氏鹨': '田鹨', '蒙古银鸥': '西伯利亚银鸥',
    '西方灰伯劳': '西灰伯劳', '西方毛脚燕': '毛脚燕',
    '亚洲短趾百灵': '短趾百灵', '亚洲漠地林莺': '荒漠林莺',
    '里海银鸥': '黄腿银鸥', '西方秧鸡': '西秧鸡'
  });
  const encoder = new TextEncoder();
  const chineseName = /^[\u3400-\u9fff·•]+$/u;
  // Match Python str.strip, including its extra ASCII separator characters.
  const trim = value => value.replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/gu, '');
  function decodeUtf8(bytes) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch (_) { throw new Error('文件不是有效的 UTF-8；请另存为 UTF-8 CSV / TSV 后重试。'); }
  }
  // csv.reader(strict=True) semantics: quotes open only at field start;
  // a closing quote may only precede another quote, delimiter, newline or EOF.
  function csvRows(text, delimiter) {
    const rows = []; let fields = [], field = '', state = 'start', line = 1, active = false;
    function endField() { fields.push(field); field = ''; state = 'start'; }
    function endRow() { if (active || fields.length || field) endField(); rows.push({values: fields, line}); fields = []; field = ''; state = 'start'; active = false; }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (state === 'quoted') {
        if (char === '"') state = 'closed';
        else { field += char; if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line++; }
      } else if (state === 'closed' && char === '"') { field += '"'; state = 'quoted'; }
      else if (char === delimiter) { endField(); active = true; }
      else if (char === '\r' || char === '\n') {
        endRow(); if (char === '\r' && text[i + 1] === '\n') i++; line++;
      } else if (state === 'closed') { throw new Error(`第 ${line} 行引号后出现无效字符`); }
      else if (state === 'start' && char === '"') { state = 'quoted'; active = true; }
      else { field += char; state = 'plain'; active = true; }
    }
    if (state === 'quoted') throw new Error(`第 ${line} 行引号未闭合`);
    if (active || fields.length || field) endRow();
    return rows;
  }
  function parseDate(value) {
    const text = trim(value);
    const match = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/u.exec(text);
    if (match) {
      const [, year, , month, day, hour = '0', minute = '0', second = '0'] = match;
      const y = +year, m = +month, d = +day;
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] && +hour < 24 && +minute < 60 && +second < 60)
        return year + String(m).padStart(2, '0') + String(d).padStart(2, '0');
    }
    throw new Error(`无效或不明确的观察日期：${text}；请使用 YYYY-MM-DD`);
  }
  function parseRecords(input, mappings = DEFAULT_MAPPINGS) {
    if (typeof input !== 'string') throw new Error('请传入 UTF-8 解码后的文本');
    const text = input.replace(/^\uFEFF/u, '');
    const first = text.split(/\r\n|\r|\n/u, 1)[0];
    const candidates = [',', '\t', ';'].map(delimiter => ({delimiter, length: (csvRows(first, delimiter)[0] || {values: []}).values.length})).filter(c => c.length > 1);
    candidates.sort((a, b) => b.length - a.length || b.delimiter.charCodeAt(0) - a.delimiter.charCodeAt(0));
    if (!candidates.length) throw new Error('无法识别表头或分隔符（支持逗号、制表符、分号）');
    const rows = csvRows(text, candidates[0].delimiter);
    const headers = rows.shift().values.map(trim);
    if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('表头包含空列名或重复列名');
    const missing = ['鸟种', '观察日期', '地点'].filter(h => !headers.includes(h));
    if (missing.length) throw new Error('缺少必需列：' + missing.join('、'));
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error('名称映射必须为对应表');
    for (const [source, target] of Object.entries(mappings)) {
      if (!chineseName.test(source) || typeof target !== 'string' || !chineseName.test(target)) throw new Error('映射的原名和目标名必须为完整中文鸟名，不可留空');
    }
    const records = [], hasCount = headers.includes('数量'); let group, date, location, skipped = 0, unknown = 0;
    for (const {values, line} of rows) {
      if (!values.some(value => trim(value))) continue;
      if (values.length !== headers.length) throw new Error(`第 ${line} 行列数与表头不一致`);
      const row = Object.fromEntries(headers.map((h, i) => [h, trim(values[i])]));
      const rowDate = parseDate(row['观察日期']);
      if (!row['地点']) throw new Error(`第 ${line} 行地点为空`);
      const key = JSON.stringify([rowDate, row['地点'], row['Submission ID'] || '', row['开始时间'] || '']);
      if (group !== undefined && group !== key) throw new Error('文件包含多个日期、地点、开始时间或清单；请按一次观鸟清单拆分后转换');
      group = key; date = rowDate; location = row['地点'];
      const rawName = row['鸟种'];
      if (!rawName) throw new Error(`第 ${line} 行鸟种为空`);
      if (rawName.includes('未识别')) { skipped++; continue; }
      // Ambiguous taxonomy must be reviewed, even in an English suffix.
      if (/[\/×?？]|杂交|不确定|\b(?:hybrid|spuh|sp\.)|(?:^|\s)[xX](?:\s|$)/iu.test(rawName))
        throw new Error(`第 ${line} 行含混合种或不确定鸟种标记，请人工核对`);
      const sourceName = rawName.split(/[\s\x1c-\x1f（(\[]/u, 1)[0];
      if (!chineseName.test(sourceName)) throw new Error(`第 ${line} 行鸟种必须为中文名称；英文、混合种或不确定鸟种需人工核对`);
      const name = Object.prototype.hasOwnProperty.call(mappings, sourceName) ? mappings[sourceName] : sourceName;
      let count = null;
      if (hasCount) {
        const value = row['数量'];
        if (!value || value.toUpperCase() === 'X') unknown++;
        else if (/^[0-9]+$/u.test(value) && Number(value) > 0) {
          count = Number(value);
          if (count > 999999999999999) throw new Error('数量超过 Excel 可精确保存的整数范围');
        } else throw new Error(`第 ${line} 行数量无效：${value}`);
      }
      records.push({name, count, rawName, sourceName, line});
    }
    if (!records.length) throw new Error('没有可导出的鸟种记录');
    if (new Set(records.map(r => r.name)).size !== records.length) throw new Error('鸟种名称重复（或映射后重复）；请人工核对单次清单，不自动合并数量');
    return {records, date, location, hasCount, skipped, unknown};
  }
  function sanitizeLocation(value) {
    const cleaned = value.replace(/[\\/:*?"<>|\x00-\x1f]/gu, '-').replace(/^[ .]+|[ .]+$/gu, '');
    let output = '', size = 0;
    for (const char of cleaned) { const bytes = encoder.encode(char).length; if (size + bytes > 180) break; output += char; size += bytes; }
    return output.replace(/[ .]+$/u, '') || '地点';
  }
  function filename(result, number = 1) {
    return `${result.date}-${sanitizeLocation(result.location)}-${result.records.length}${number > 1 ? '-' + number : ''}.xlsx`;
  }
  const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function zip(entries) {
    const chunks = [], central = []; let offset = 0, centralSize = 0;
    function header(length) { const bytes = new Uint8Array(length); return {bytes, view: new DataView(bytes.buffer)}; }
    for (const [path, content] of entries) {
      const name = encoder.encode(path), data = typeof content === 'string' ? encoder.encode(content) : content, crc = crc32(data);
      const local = header(30 + name.length), l = local.view;
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(12, 33, true);
      l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true); local.bytes.set(name, 30);
      chunks.push(local.bytes, data);
      const center = header(46 + name.length), c = center.view;
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 33, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); center.bytes.set(name, 46);
      central.push(center.bytes); centralSize += center.bytes.length; offset += local.bytes.length + data.length;
    }
    const end = header(22), e = end.view;
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    const output = new Uint8Array(offset + centralSize + 22); let cursor = 0;
    for (const chunk of [...chunks, ...central, end.bytes]) { output.set(chunk, cursor); cursor += chunk.length; }
    return output;
  }
  // Public archive API accepts flat filenames only. Never emit traversal paths.
  function buildZip(entries) {
    if (!Array.isArray(entries) || entries.length > 65535) throw new Error('ZIP 文件数量无效');
    const seen = new Set(); let size = 22;
    const validated = entries.map(entry => {
      if (!entry || typeof entry.name !== 'string' || !entry.name || /[\\/:*?"<>|\x00-\x1f]/u.test(entry.name) || /^[ .]|[ .]$/u.test(entry.name)) throw new Error('ZIP 文件名无效，不允许目录或路径');
      const name = entry.name.normalize('NFC');
      const key = name.toLowerCase();
      if (seen.has(key)) throw new Error('ZIP 文件名重复：' + name);
      seen.add(key);
      if (typeof entry.data !== 'string' && !(entry.data instanceof Uint8Array)) throw new Error('ZIP 内容须为文本或 Uint8Array');
      const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
      const nameLength = encoder.encode(name).length;
      if (nameLength > 65535) throw new Error('ZIP 文件名过长');
      size += 76 + 2 * nameLength + data.length;
      if (size > 0xffffffff) throw new Error('ZIP 超过支持的大小，请分批下载');
      return [name, data];
    });
    return zip(validated);
  }
  function xml(text) {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/u.test(text)) throw new Error('导出名称含有不支持的控制字符');
    return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
  }
  function buildXlsx(result) {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const textCell = (ref, text, bold = false) => `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
    let sheet = `<worksheet xmlns="${ns}"><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/></cols><sheetData><row r="1">${textCell('A1', '中文名', true)}${result.hasCount ? textCell('B1', '数量', true) : ''}</row>`;
    result.records.forEach((record, i) => {
      const row = i + 2;
      if (result.hasCount && record.count !== null && (!Number.isSafeInteger(record.count) || record.count < 1 || record.count > 999999999999999)) throw new Error('导出数量无效');
      sheet += `<row r="${row}">${textCell('A' + row, record.name)}${result.hasCount && record.count !== null ? `<c r="B${row}" t="n"><v>${record.count}</v></c>` : ''}</row>`;
    });
    sheet += '</sheetData></worksheet>';
    return zip([
      ['[Content_Types].xml', declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', declaration + `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="导入数据" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', declaration + `<styleSheet xmlns="${ns}"><fonts count="2"><font><name val="Calibri"/><sz val="11"/></font><font><b/><name val="Calibri"/><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ['xl/worksheets/sheet1.xml', declaration + sheet]
    ]);
  }
  return Object.freeze({DEFAULT_MAPPINGS, decodeUtf8, parseRecords, parseDate, sanitizeLocation, filename, buildXlsx, buildZip});
});
