'use strict';

const { MODES, getMode, parseTimecode, framesToTimecode } = require('./timecode');
const { parseCsv, mapRows } = require('./csv');

/**
 * 核对一份接片单。
 * @param {{csv:string, mode:string}} input
 * @returns 结构化核对结果（行级错误 / 时长不一致 / 全部重叠对 / 全部空隙）
 */
function analyze(input) {
  const mode = getMode(input.mode);
  const { rows: rawRows, error: csvError } = parseCsv(input.csv || '');
  const { mapped, hasHeader } = mapRows(rawRows);

  const rows = mapped.map((r) => buildRow(r, mode.key));

  // 成片顺序排序（仅时间码区间合法的行参与）
  const timelineRows = rows
    .filter((r) => r.timelineValid)
    .sort((a, b) => a.programInFrames - b.programInFrames || a.line - b.line);
  timelineRows.forEach((r, i) => {
    r.programOrder = i + 1;
  });

  const overlaps = findOverlaps(timelineRows, mode.key);
  const gaps = findGaps(timelineRows, mode.key);

  // 涉及问题的行号（前端高亮用）
  const problemLines = new Set();
  rows.filter((r) => r.errors.length > 0).forEach((r) => problemLines.add(r.line));
  overlaps.forEach((o) => o.lines.forEach((l) => problemLines.add(l)));
  gaps.forEach((g) => g.lines.forEach((l) => problemLines.add(l)));

  let timelineStart = null;
  let timelineEnd = null;
  let unionFrames = 0;
  if (timelineRows.length) {
    timelineRows.forEach((r) => mergePiece(r.programInFrames, r.programOutFrames));
  }
  function mergePiece(inF, outF) {
    if (timelineStart === null) {
      timelineStart = inF;
      timelineEnd = outF;
      unionFrames = outF - inF;
      return;
    }
    if (inF <= timelineEnd) {
      if (outF > timelineEnd) {
        unionFrames += outF - timelineEnd;
        timelineEnd = outF;
      }
    } else {
      unionFrames += outF - inF;
      timelineEnd = outF;
    }
    if (inF < timelineStart) timelineStart = inF;
  }

  const spanFrames = timelineStart === null ? 0 : timelineEnd - timelineStart;

  return {
    mode: mode.key,
    modeLabel: mode.label,
    dropFrame: mode.dropFrame,
    nominalFps: mode.fps,
    hasHeader,
    csvError,
    rowCount: rows.length,
    invalidRowCount: rows.filter((r) => r.errors.length > 0).length,
    timelineRowCount: timelineRows.length,
    overlapCount: overlaps.length,
    gapCount: gaps.length,
    rows,
    overlaps,
    gaps,
    timeline: {
      startFrames: timelineStart,
      endFrames: timelineEnd,
      startTc: timelineStart === null ? null : framesToTimecode(timelineStart, mode.key),
      endTc: timelineEnd === null ? null : framesToTimecode(timelineEnd, mode.key),
      spanFrames,
      spanTc: framesToTimecode(spanFrames, mode.key),
      unionFrames,
      unionTc: framesToTimecode(unionFrames, mode.key),
      coverageRatio: spanFrames === 0 ? null : unionFrames / spanFrames,
      unionPieces: buildUnionPieces(timelineRows, mode.key),
    },
    problemLines: [...problemLines].sort((a, b) => a - b),
  };
}

function buildRow(r, modeKey) {
  const errors = [];
  const warnings = [];

  if (r.colCount !== 5) {
    errors.push(`列数为 ${r.colCount}，应为 5 列（片段名 / 素材入点 / 素材出点 / 成片入点 / 成片出点）`);
  }
  if (!r.name) warnings.push('片段名为空');
  ['sourceIn', 'sourceOut', 'programIn', 'programOut'].forEach((field) => {
    if (!r[field]) errors.push(`${FIELD_LABEL[field]}为空`);
  });

  const parsed = {};
  for (const field of ['sourceIn', 'sourceOut', 'programIn', 'programOut']) {
    if (!r[field]) continue;
    const res = parseTimecode(r[field], modeKey);
    if (res.ok) {
      parsed[field] = res.frames;
    } else {
      errors.push(`${FIELD_LABEL[field]}：${res.message}`);
    }
  }

  const out = {
    line: r.line,
    name: r.name,
    sourceInText: r.sourceIn,
    sourceOutText: r.sourceOut,
    programInText: r.programIn,
    programOutText: r.programOut,
    sourceInFrames: null,
    sourceOutFrames: null,
    programInFrames: null,
    programOutFrames: null,
    sourceDuration: null,
    programDuration: null,
    sourceDurationTc: null,
    programDurationTc: null,
    programInTc: null,
    programOutTc: null,
    programOrder: null,
    errors,
    warnings,
    timelineValid: false,
  };

  const checkOrder = (inKey, outKey, label) => {
    if (parsed[inKey] !== undefined && parsed[outKey] !== undefined) {
      if (parsed[outKey] === parsed[inKey]) {
        errors.push(`${label}入点与出点相同（时长为 0）；区间为半开 [入点, 出点)，出点必须晚于入点`);
      } else if (parsed[outKey] < parsed[inKey]) {
        errors.push(`${label}出点早于入点（可能为跨午夜区间）；不支持跨午夜，出点必须晚于入点`);
      }
    }
  };
  checkOrder('sourceIn', 'sourceOut', '素材');
  checkOrder('programIn', 'programOut', '成片');

  if (parsed.sourceIn !== undefined) {
    out.sourceInFrames = parsed.sourceIn;
  }
  if (parsed.sourceOut !== undefined) {
    out.sourceOutFrames = parsed.sourceOut;
  }
  if (parsed.programIn !== undefined) {
    out.programInFrames = parsed.programIn;
    out.programInTc = framesToTimecode(parsed.programIn, modeKey);
  }
  if (parsed.programOut !== undefined) {
    out.programOutFrames = parsed.programOut;
    out.programOutTc = framesToTimecode(parsed.programOut, modeKey);
  }

  if (out.sourceOutFrames !== null && out.sourceInFrames !== null && out.sourceOutFrames > out.sourceInFrames) {
    out.sourceDuration = out.sourceOutFrames - out.sourceInFrames;
    out.sourceDurationTc = framesToTimecode(out.sourceDuration, modeKey);
  }
  if (out.programOutFrames !== null && out.programInFrames !== null && out.programOutFrames > out.programInFrames) {
    out.programDuration = out.programOutFrames - out.programInFrames;
    out.programDurationTc = framesToTimecode(out.programDuration, modeKey);
  }

  // 实际帧数比较素材时长与成片时长
  if (out.sourceDuration !== null && out.programDuration !== null && out.sourceDuration !== out.programDuration) {
    errors.push(
      `素材时长与成片时长不一致：素材 ${out.sourceDuration} 帧（${out.sourceDurationTc}），` +
        `成片 ${out.programDuration} 帧（${out.programDurationTc}），相差 ${Math.abs(
          out.sourceDuration - out.programDuration,
        )} 帧`,
    );
  }

  out.timelineValid = out.programDuration !== null;
  return out;
}

const FIELD_LABEL = {
  sourceIn: '素材入点',
  sourceOut: '素材出点',
  programIn: '成片入点',
  programOut: '成片出点',
};

/**
 * 扫描线求全部重叠区间对——不依赖“相邻”，同一时刻活动集合中的任意两行都会被配对。
 * 半开区间：end 事件先于 start 事件处理，首尾相接不算重叠。
 */
function findOverlaps(rows, modeKey) {
  const events = [];
  for (const r of rows) {
    events.push({ frame: r.programInFrames, kind: 'start', row: r });
    events.push({ frame: r.programOutFrames, kind: 'end', row: r });
  }
  events.sort((a, b) => {
    if (a.frame !== b.frame) return a.frame - b.frame;
    // 同一帧：先结束后开始（[in,out) 相接合法）
    if (a.kind !== b.kind) return a.kind === 'end' ? -1 : 1;
    return a.row.line - b.row.line;
  });

  const pairs = [];
  const active = new Map();
  for (const ev of events) {
    if (ev.kind === 'end') {
      active.delete(ev.row.line);
      continue;
    }
    for (const other of active.values()) {
      const start = Math.max(other.programInFrames, ev.row.programInFrames);
      const end = Math.min(other.programOutFrames, ev.row.programOutFrames);
      const a = other.line < ev.row.line ? other : ev.row;
      const b = other.line < ev.row.line ? ev.row : other;
      pairs.push({
        lines: [a.line, b.line],
        names: [a.name || `第 ${a.line} 行`, b.name || `第 ${b.line} 行`],
        startFrames: start,
        endFrames: end,
        startTc: framesToTimecode(start, modeKey),
        endTc: framesToTimecode(end, modeKey),
        overlapFrames: end - start,
        overlapTc: framesToTimecode(end - start, modeKey),
        a: pairSide(a),
        b: pairSide(b),
      });
    }
    active.set(ev.row.line, ev.row);
  }

  pairs.sort((x, y) => x.startFrames - y.startFrames || x.lines[0] - y.lines[0] || x.lines[1] - y.lines[1]);
  return pairs;
}

function pairSide(r) {
  return {
    line: r.line,
    name: r.name || `第 ${r.line} 行`,
    inFrames: r.programInFrames,
    outFrames: r.programOutFrames,
    inTc: r.programInTc,
    outTc: r.programOutTc,
  };
}

/**
 * 合并成片区间后，列出并集各段之间的全部空隙（区间内部首尾相接不算空隙）。
 */
function findGaps(rows, modeKey) {
  if (rows.length === 0) return [];
  const pieces = mergeIntervals(rows.map((r) => [r.programInFrames, r.programOutFrames]));

  const gaps = [];
  for (let i = 1; i < pieces.length; i++) {
    const start = pieces[i - 1][1];
    const end = pieces[i][0];
    if (end <= start) continue; // 理论上不会发生（合并时已相接）
    const before = rows.filter((r) => r.programOutFrames === start);
    const after = rows.filter((r) => r.programInFrames === end);
    gaps.push({
      index: gaps.length + 1,
      startFrames: start,
      endFrames: end,
      startTc: framesToTimecode(start, modeKey),
      endTc: framesToTimecode(end, modeKey),
      gapFrames: end - start,
      gapTc: framesToTimecode(end - start, modeKey),
      beforeLines: before.map((r) => r.line),
      afterLines: after.map((r) => r.line),
      lines: [...before.map((r) => r.line), ...after.map((r) => r.line)],
      beforeNames: before.map((r) => r.name || `第 ${r.line} 行`),
      afterNames: after.map((r) => r.name || `第 ${r.line} 行`),
    });
  }
  return gaps;
}

function buildUnionPieces(rows, modeKey) {
  const pieces = mergeIntervals(rows.map((r) => [r.programInFrames, r.programOutFrames]));
  return pieces.map(([s, e]) => ({
    startFrames: s,
    endFrames: e,
    startTc: framesToTimecode(s, modeKey),
    endTc: framesToTimecode(e, modeKey),
    frames: e - s,
  }));
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

module.exports = { analyze, MODES };
