'use strict';

/**
 * 极简 RFC 4180 风格 CSV 解析器（支持引号字段、字段内逗号与换行、双引号转义）。
 * 返回行数组：{ line: 物理起始行号(1-based), cells: string[] }。
 * 纯空白物理行被跳过。
 */
function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  const cells = [];
  let field = '';
  let inQuotes = false;
  let recordHasChar = false;
  let physical = 1; // 扫描头所在物理行：任何换行（含字段内）都 +1
  let recordStart = 1; // 当前记录起始物理行；只在引号外换行时推进
  let i = 0;

  const pushField = () => {
    cells.push(field);
    field = '';
  };
  const finishRecord = () => {
    pushField();
    rows.push({ line: recordStart, cells: cells.splice(0, cells.length) });
    recordHasChar = false;
  };
  // 消费换行（CRLF / LF / CR），推进物理行号；返回换行后的下一个索引
  const consumeLineBreak = (idx) => {
    if (src[idx] === '\r' && src[idx + 1] === '\n') idx++;
    physical++;
    return idx + 1;
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else if (ch === '\r' || ch === '\n') {
        field += '\n';
        i = consumeLineBreak(i);
      } else {
        field += ch;
        i++;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      recordHasChar = true;
      i++;
    } else if (ch === ',') {
      pushField();
      recordHasChar = true;
      i++;
    } else if (ch === '\r' || ch === '\n') {
      const hadRecord = recordHasChar;
      if (hadRecord) finishRecord();
      i = consumeLineBreak(i);
      // 引号外换行：它结束当前物理行，下一条记录（或空白后的记录）从新行开始
      recordStart = physical;
    } else {
      if (!recordHasChar && /\S/.test(ch)) recordHasChar = true;
      field += ch;
      i++;
    }
  }

  if (recordHasChar || inQuotes || cells.length > 0 || field.length > 0) {
    finishRecord();
  }
  const error = inQuotes ? 'CSV 存在未闭合的引号字段（缺少结尾双引号）' : null;
  return { rows, error };
}

const HEADER_ALIASES = {
  name: ['片段名', '素材名', '名称', '片段', 'clip', 'clipname', 'name', 'shot', '镜头'],
  sourceIn: ['素材入点', '素材进点', '源入点', 'sourcein', 'srcin', 'in_source', 'mediain'],
  sourceOut: ['素材出点', '源出点', 'sourceout', 'srcout', 'out_source', 'mediaout'],
  programIn: ['成片入点', '节目入点', '序列入点', 'programin', 'prgin', 'recin', 'recordin', 'timelinein'],
  programOut: ['成片出点', '节目出点', '序列出点', 'programout', 'prgout', 'recout', 'recordout', 'timelineout'],
};

function normHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：()（）]/g, '');
}

/**
 * 识别表头并把每行映射为五列。
 * 没有可识别表头时按固定顺序：片段名,素材入点,素材出点,成片入点,成片出点。
 */
function mapRows(rows) {
  let hasHeader = false;
  const colIndex = { name: 0, sourceIn: 1, sourceOut: 2, programIn: 3, programOut: 4 };

  if (rows.length > 0) {
    const headerCells = rows[0].cells.map(normHeader);
    const found = {};
    let matches = 0;
    for (const [fieldName, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = headerCells.findIndex((c) =>
        aliases.some((a) => {
          const na = normHeader(a);
          return c === na || c.includes(na);
        }),
      );
      if (idx >= 0) {
        found[fieldName] = idx;
        matches++;
      }
    }
    if (matches >= 4) {
      hasHeader = true;
      Object.assign(colIndex, found);
    }
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const mapped = dataRows.map((r) => {
    const get = (k) => (r.cells[colIndex[k]] ?? '').trim();
    return {
      line: r.line,
      raw: r.cells,
      name: get('name'),
      sourceIn: get('sourceIn'),
      sourceOut: get('sourceOut'),
      programIn: get('programIn'),
      programOut: get('programOut'),
      colCount: r.cells.length,
    };
  });

  return { mapped, hasHeader };
}

module.exports = { parseCsv, mapRows };
