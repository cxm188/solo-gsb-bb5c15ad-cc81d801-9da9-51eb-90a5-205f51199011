'use strict';
const { analyze } = require('./src/analyze');
const { SAMPLES } = require('./src/samples');
const assert = require('assert');

// ---------- 基础：连续无问题 ----------
{
  const csv = [
    '片段名,素材入点,素材出点,成片入点,成片出点',
    'a,00:00:00:00,00:00:10:00,00:00:00:00,00:00:10:00',
    'b,00:00:00:00,00:00:05:00,00:00:10:00,00:00:15:00',
    'c,00:00:00:00,00:00:05:00,00:00:15:00,00:00:20:00',
  ].join('\n');
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.invalidRowCount, 0, JSON.stringify(r.rows.map((x) => x.errors)));
  assert.strictEqual(r.overlapCount, 0);
  assert.strictEqual(r.gapCount, 0, '首尾相接不应报空隙');
  assert.strictEqual(r.timeline.unionFrames, 500);
  assert.strictEqual(r.timeline.spanFrames, 500);
}

// ---------- 空隙 ----------
{
  const csv = [
    'a,00:00:00:00,00:00:10:00,00:00:00:00,00:00:10:00',
    'b,00:00:00:00,00:00:10:00,00:00:20:00,00:00:30:00',
  ].join('\n');
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.gapCount, 1);
  assert.deepStrictEqual([r.gaps[0].startTc, r.gaps[0].endTc], ['00:00:10:00', '00:00:20:00']);
  assert.strictEqual(r.gaps[0].gapFrames, 250);
  assert.deepStrictEqual(r.gaps[0].lines, [1, 2]);
}

// ---------- 重叠：相邻 ----------
{
  const csv = [
    'a,00:00:00:00,00:00:10:00,00:00:00:00,00:00:10:00',
    'b,00:00:00:00,00:00:10:00,00:00:05:00,00:00:15:00',
  ].join('\n');
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.overlapCount, 1);
  assert.strictEqual(r.overlaps[0].overlapFrames, 125);
  assert.deepStrictEqual(r.overlaps[0].lines, [1, 2]);
}

// ---------- 重叠：非相邻（包含关系必须被发现，不能只比相邻行） ----------
{
  const csv = [
    'outer,00:00:00:00,00:00:30:00,00:00:00:00,00:00:30:00',
    'mid1,00:00:00:00,00:00:05:00,00:00:40:00,00:00:45:00',
    'mid2,00:00:00:00,00:00:05:00,00:00:50:00,00:00:55:00',
    'inside,00:00:00:00,00:00:05:00,00:00:10:00,00:00:15:00',
  ].join('\n');
  const r = analyze({ csv, mode: '25' });
  const pairLines = r.overlaps.map((o) => o.lines.join(','));
  // 数据行物理行号 1..4（无表头）；包含对 (outer=1, inside=4) 必须出现
  assert.ok(pairLines.includes('1,4'), `缺少非相邻包含对，实际：${pairLines}`);
  assert.strictEqual(r.overlaps.length, 1);
  assert.strictEqual(r.overlaps[0].overlapFrames, 125);
}

// ---------- 多方重叠：3 行同时重叠应给出 C(3,2)=3 对 ----------
{
  const csv = [
    'a,00:00:00:00,00:00:10:00,00:00:00:00,00:00:10:00',
    'b,00:00:00:00,00:00:10:00,00:00:02:00,00:00:12:00',
    'c,00:00:00:00,00:00:10:00,00:00:04:00,00:00:14:00',
  ].join('\n');
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.overlapCount, 3);
}

// ---------- 时长不一致（按实际帧数） ----------
{
  const csv = ['x,00:00:00:00,00:00:05:00,00:00:00:00,00:00:04:00'].join('\n');
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.invalidRowCount, 1);
  assert.ok(r.rows[0].errors.some((e) => e.includes('不一致')));
  assert.strictEqual(r.rows[0].sourceDuration, 125);
  assert.strictEqual(r.rows[0].programDuration, 100);
}

// ---------- DF 模式下时长一致（跨过丢帧边界，实际帧数相等即合法） ----------
{
  const csv = ['x,00:00:59:29,00:01:00:02,00:02:59:29,00:03:00:02'].join('\n');
  const r = analyze({ csv, mode: '2997df' });
  assert.strictEqual(r.invalidRowCount, 0, JSON.stringify(r.rows[0].errors));
  assert.strictEqual(r.rows[0].sourceDuration, 1);
  assert.strictEqual(r.rows[0].programDuration, 1);
}

// ---------- 非法帧号 / 跨午夜 ----------
{
  const csv = [
    // 帧 25：仅 25fps 非法；DF 合法且两侧时长都为 25 帧
    'badFrame,00:00:00:00,00:00:00:25,00:00:02:00,00:00:02:25',
    'midnight,23:59:50:00,00:00:00:05,00:00:00:00,00:00:01:00',
    // DF 下成片入点落在丢帧分钟开头（非法），25fps 下合法且时长相等
    'dropBad,00:00:00:00,00:00:00:02,00:01:00:00,00:01:00:02',
  ].join('\n');
  const r25 = analyze({ csv, mode: '25' });
  assert.strictEqual(r25.invalidRowCount, 2); // badFrame + midnight（dropBad 在 25fps 合法）
  assert.ok(r25.rows[0].errors.some((e) => e.includes('帧号 25 非法')));
  const rdf = analyze({ csv, mode: '2997df' });
  assert.strictEqual(rdf.invalidRowCount, 2); // midnight + dropBad（badFrame 在 DF 合法）
  assert.ok(rdf.rows[2].errors.some((e) => e.includes('丢帧')));
  assert.strictEqual(rdf.rows[0].errors.length, 0);
}

// ---------- 列数错误 / 空字段 ----------
{
  const csv = 'a,1,2,3\nb,,00:00:02:00,00:00:00:00,00:00:01:00';
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.invalidRowCount, 2);
}

// ---------- 引号字段、字段内逗号/换行 ----------
{
  const csv = '"name,with,comma",00:00:00:00,00:00:01:00,00:00:00:00,00:00:01:00\n"line1\nline2",00:00:00:00,00:00:01:00,00:00:01:00,00:00:02:00';
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.invalidRowCount, 0, JSON.stringify(r.rows.map((x) => x.errors)));
  assert.strictEqual(r.rowCount, 2);
  // 第二行起始引号在物理行 2，字段内换行跨到物理行 3
  assert.strictEqual(r.rows[1].line, 2);
  assert.strictEqual(r.rows[1].name, 'line1\nline2');
}

// ---------- 无表头按固定顺序 ----------
{
  const csv = 'a,00:00:00:00,00:00:10:00,00:00:00:00,00:00:10:00';
  const r = analyze({ csv, mode: '25' });
  assert.strictEqual(r.hasHeader, false);
  assert.strictEqual(r.rows[0].name, 'a');
}

// ---------- 排序：乱序输入，成片顺序正确 ----------
{
  const csv = [
    'late,00:00:00:00,00:00:05:00,00:00:20:00,00:00:25:00',
    'early,00:00:00:00,00:00:05:00,00:00:00:00,00:00:05:00',
    'middle,00:00:00:00,00:00:05:00,00:00:10:00,00:00:15:00',
  ].join('\n');
  const r = analyze({ csv, mode: '25' });
  const sorted = r.rows.filter((x) => x.timelineValid).sort((a, b) => a.programOrder - b.programOrder);
  assert.deepStrictEqual(sorted.map((x) => x.name), ['early', 'middle', 'late']);
  assert.strictEqual(r.gapCount, 2);
}

// ---------- 示例数据：两种模式都应检出各类问题 ----------
for (const mode of ['25', '2997df']) {
  const r = analyze({ csv: SAMPLES[mode], mode });
  assert.ok(r.invalidRowCount >= 2, `${mode} 示例应包含非法行`);
  assert.ok(r.overlapCount >= 3, `${mode} 示例应包含 >=3 重叠（含非相邻包含）`);
  assert.ok(r.gapCount >= 3, `${mode} 示例应包含多段空隙`);
  // 必须包含至少一对物理行不相邻的包含关系，证明不是只比较相邻行
  const nonAdjacent = r.overlaps.some((o) => Math.abs(o.lines[0] - o.lines[1]) > 1);
  assert.ok(nonAdjacent, `${mode} 示例应包含非相邻行重叠对`);
  // 每个问题都带原始行号
  r.overlaps.forEach((o) => assert.strictEqual(o.lines.length, 2));
  r.gaps.forEach((g) => assert.ok(g.lines.length >= 2));
  // 时间轴 pieces 不相交
  const pieces = r.timeline.unionPieces;
  for (let i = 1; i < pieces.length; i++) assert.ok(pieces[i].startFrames >= pieces[i - 1].endFrames);
  console.log(`${mode} 示例：${r.rowCount} 行, 非法 ${r.invalidRowCount}, 重叠 ${r.overlapCount}, 空隙 ${r.gapCount}`);
}

console.log('analyze tests passed');
