import { Mode, parseTimecode, formatTimecode } from "./timecode";

/** 单行核对结果（对应原始 CSV 的一行，line 为 1 起始的原始行号） */
export interface RowResult {
  line: number;
  name: string;
  srcIn: string;
  srcOut: string;
  recIn: string;
  recOut: string;
  /** 各时间码对应的实际帧数（解析失败则为 null） */
  srcInF: number | null;
  srcOutF: number | null;
  recInF: number | null;
  recOutF: number | null;
  /** 实际帧数时长（出点不包含：时长 = 出点帧 - 入点帧） */
  srcDur: number | null;
  recDur: number | null;
  errors: string[];
}

export interface DurationIssue {
  line: number;
  name: string;
  srcDur: number;
  recDur: number;
  diff: number;
}

export interface GapIssue {
  startF: number;
  endF: number;
  frames: number;
  startTc: string;
  endTc: string;
  beforeLine: number;
  afterLine: number;
}

export interface OverlapIssue {
  startF: number;
  endF: number;
  frames: number;
  startTc: string;
  endTc: string;
  lines: [number, number];
}

export interface CheckResponse {
  mode: Mode;
  dataRowCount: number;
  rows: RowResult[];
  durationIssues: DurationIssue[];
  gaps: GapIssue[];
  overlaps: OverlapIssue[];
}

/** 解析 CSV 文本为二维数组，支持引号包裹字段与 "" 转义，兼容 CRLF 与 BOM */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    pushRow();
  }
  return rows;
}

const TC_LIKE_RE = /^\s*\d{1,2}:\d{2}:\d{2}:\d{2}\s*$/;

/** 首行 2-5 列不像时间码则视为表头并跳过 */
function looksLikeDataRow(cols: string[]): boolean {
  return (
    cols.length >= 5 &&
    [1, 2, 3, 4].every((idx) => idx < cols.length && TC_LIKE_RE.test(cols[idx]))
  );
}

function tryParse(tc: string, mode: Mode): { value: number | null; error: string | null } {
  try {
    return { value: parseTimecode(tc, mode), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

interface Interval {
  line: number;
  name: string;
  start: number;
  end: number;
}

/** 主入口：核对整份接片单 */
export function checkEdl(csv: string, mode: Mode): CheckResponse {
  const grid = parseCsv(csv);
  const startIdx = grid.length > 0 && !looksLikeDataRow(grid[0]) ? 1 : 0;

  const rows: RowResult[] = [];

  for (let i = startIdx; i < grid.length; i++) {
    const line = i + 1; // 原始行号（含表头），1 起始
    const cols = grid[i];
    if (cols.every((c) => c.trim() === "")) continue; // 跳过空行

    if (cols.length !== 5) {
      rows.push({
        line,
        name: "（无法解析）",
        srcIn: "",
        srcOut: "",
        recIn: "",
        recOut: "",
        srcInF: null,
        srcOutF: null,
        recInF: null,
        recOutF: null,
        srcDur: null,
        recDur: null,
        errors: [
          `该行共 ${cols.length} 列，应为 5 列：片段名,素材入点,素材出点,成片入点,成片出点`,
        ],
      });
      continue;
    }

    const [name, srcIn, srcOut, recIn, recOut] = cols.map((c) => c.trim());
    const row: RowResult = {
      line,
      name,
      srcIn,
      srcOut,
      recIn,
      recOut,
      srcInF: null,
      srcOutF: null,
      recInF: null,
      recOutF: null,
      srcDur: null,
      recDur: null,
      errors: [],
    };

    const fields: Array<["srcInF" | "srcOutF" | "recInF" | "recOutF", string, string]> = [
      ["srcInF", srcIn, "素材入点"],
      ["srcOutF", srcOut, "素材出点"],
      ["recInF", recIn, "成片入点"],
      ["recOutF", recOut, "成片出点"],
    ];
    for (const [key, value, label] of fields) {
      const r = tryParse(value, mode);
      if (r.error) {
        row.errors.push(`${label}：${r.error}`);
      } else {
        row[key] = r.value;
      }
    }

    // 出点必须晚于入点：出点不包含，零长度或倒序（跨午夜）一律拒绝
    if (row.srcInF !== null && row.srcOutF !== null) {
      if (row.srcOutF <= row.srcInF) {
        row.errors.push(
          `素材出点（${srcOut}）必须晚于素材入点（${srcIn}）：出点不包含，禁止零长度或跨午夜区间`
        );
      } else {
        row.srcDur = row.srcOutF - row.srcInF;
      }
    }
    if (row.recInF !== null && row.recOutF !== null) {
      if (row.recOutF <= row.recInF) {
        row.errors.push(
          `成片出点（${recOut}）必须晚于成片入点（${recIn}）：出点不包含，禁止零长度或跨午夜区间`
        );
      } else {
        row.recDur = row.recOutF - row.recInF;
      }
    }

    rows.push(row);
  }

  // 1) 素材与成片时长比对（按实际帧数）
  const durationIssues: DurationIssue[] = rows
    .filter((r) => r.srcDur !== null && r.recDur !== null && r.srcDur !== r.recDur)
    .map((r) => ({
      line: r.line,
      name: r.name,
      srcDur: r.srcDur as number,
      recDur: r.recDur as number,
      diff: (r.recDur as number) - (r.srcDur as number),
    }));

  // 2) 成片区间排序后做全局空隙 / 重叠扫描（不只比较相邻行）
  const intervals: Interval[] = rows
    .filter((r) => r.recInF !== null && r.recOutF !== null && (r.recOutF as number) > (r.recInF as number))
    .map((r) => ({
      line: r.line,
      name: r.name,
      start: r.recInF as number,
      end: r.recOutF as number,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.line - b.line);

  const gaps: GapIssue[] = [];
  const overlaps: OverlapIssue[] = [];

  // 空隙：扫描线维护当前已覆盖的最远出点
  let coverEnd = -1;
  let coverLine = -1;
  for (const iv of intervals) {
    if (coverEnd >= 0 && iv.start > coverEnd) {
      gaps.push({
        startF: coverEnd,
        endF: iv.start,
        frames: iv.start - coverEnd,
        startTc: formatTimecode(coverEnd, mode),
        endTc: formatTimecode(iv.start, mode),
        beforeLine: coverLine,
        afterLine: iv.line,
      });
    }
    if (iv.end > coverEnd) {
      coverEnd = iv.end;
      coverLine = iv.line;
    }
  }

  // 重叠：扫描线 + 活跃集合，列出所有两两重叠（不限于相邻行）
  let active: Interval[] = [];
  for (const iv of intervals) {
    for (const a of active) {
      if (a.end > iv.start) {
        const end = Math.min(a.end, iv.end);
        overlaps.push({
          startF: iv.start,
          endF: end,
          frames: end - iv.start,
          startTc: formatTimecode(iv.start, mode),
          endTc: formatTimecode(end, mode),
          lines: [a.line, iv.line],
        });
      }
    }
    active = active.filter((a) => a.end > iv.start);
    active.push(iv);
  }

  return {
    mode,
    dataRowCount: rows.length,
    rows,
    durationIssues,
    gaps,
    overlaps,
  };
}
