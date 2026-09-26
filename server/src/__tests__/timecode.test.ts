import test from "node:test";
import assert from "node:assert/strict";
import { parseTimecode, formatTimecode } from "../timecode";
import { checkEdl, parseCsv } from "../checker";

// ---------- 25fps 非丢帧 ----------

test("ndf25: 基本解析", () => {
  assert.equal(parseTimecode("00:00:00:00", "ndf25"), 0);
  assert.equal(parseTimecode("00:00:00:24", "ndf25"), 24);
  assert.equal(parseTimecode("00:00:01:00", "ndf25"), 25);
  assert.equal(parseTimecode("01:00:00:00", "ndf25"), 90000);
  assert.equal(parseTimecode("23:59:59:24", "ndf25"), 2159999);
});

test("ndf25: 帧号越界拒绝", () => {
  assert.throws(() => parseTimecode("00:00:00:25", "ndf25"), /帧号超出范围/);
  assert.throws(() => parseTimecode("00:00:60:00", "ndf25"), /秒超出范围/);
  assert.throws(() => parseTimecode("00:60:00:00", "ndf25"), /分钟超出范围/);
  assert.throws(() => parseTimecode("24:00:00:00", "ndf25"), /跨午夜/);
  assert.throws(() => parseTimecode("abc", "ndf25"), /格式错误/);
});

test("ndf25: 帧数回算时间码", () => {
  assert.equal(formatTimecode(0, "ndf25"), "00:00:00:00");
  assert.equal(formatTimecode(1499, "ndf25"), "00:00:59:24");
  assert.equal(formatTimecode(1500, "ndf25"), "00:01:00:00");
  assert.equal(formatTimecode(2159999, "ndf25"), "23:59:59:24");
});

// ---------- 29.97fps 丢帧 ----------

test("df2997: 每分钟跳过 00/01，整十分钟不跳", () => {
  // 00:01:00:00 与 00:01:00:01 不存在
  assert.throws(() => parseTimecode("00:01:00:00", "df2997"), /不存在的帧号/);
  assert.throws(() => parseTimecode("00:01:00:01", "df2997"), /不存在的帧号/);
  assert.throws(() => parseTimecode("00:09:00:01", "df2997"), /不存在的帧号/);
  // 整十分钟不跳
  assert.equal(parseTimecode("00:10:00:00", "df2997"), 17982);
  assert.equal(parseTimecode("00:10:00:01", "df2997"), 17983);
  assert.equal(parseTimecode("00:20:00:00", "df2997"), 35964);
  // 普通分钟首帧为 02
  assert.equal(parseTimecode("00:01:00:02", "df2997"), 1800);
  assert.equal(parseTimecode("00:02:00:02", "df2997"), 3598);
});

test("df2997: 跨分钟边界的实际帧数连续", () => {
  const a = parseTimecode("00:00:59:29", "df2997");
  const b = parseTimecode("00:01:00:02", "df2997");
  assert.equal(b - a, 1);
  const c = parseTimecode("00:09:59:29", "df2997");
  const d = parseTimecode("00:10:00:00", "df2997");
  assert.equal(d - c, 1);
});

test("df2997: 帧号越界拒绝", () => {
  assert.throws(() => parseTimecode("00:00:00:30", "df2997"), /帧号超出范围/);
});

test("df2997: 帧数回算时间码（不产出被跳过的帧号）", () => {
  assert.equal(formatTimecode(0, "df2997"), "00:00:00:00");
  assert.equal(formatTimecode(1799, "df2997"), "00:00:59:29");
  assert.equal(formatTimecode(1800, "df2997"), "00:01:00:02");
  assert.equal(formatTimecode(17981, "df2997"), "00:09:59:29");
  assert.equal(formatTimecode(17982, "df2997"), "00:10:00:00");
  assert.equal(formatTimecode(107892, "df2997"), "01:00:00:00");
  // 往返一致
  for (const tc of ["00:00:00:00", "00:01:00:02", "00:09:59:29", "00:10:00:00", "01:23:45:12", "23:59:59:29"]) {
    assert.equal(formatTimecode(parseTimecode(tc, "df2997"), "df2997"), tc);
  }
});

// ---------- 接片单核对 ----------

test("checkEdl: 时长不匹配、空隙、重叠、非相邻重叠", () => {
  const csv = [
    "片段名,素材入点,素材出点,成片入点,成片出点",
    "A,00:00:00:00,00:00:10:00,00:00:00:00,00:00:10:00", // 250f
    "B,00:00:00:00,00:00:05:00,00:00:10:00,00:00:15:12", // 素材125f vs 成片137f → 不匹配
    "C,00:00:00:00,00:00:05:00,00:00:14:00,00:00:19:00", // 与 B 重叠 [14:00,15:12)
    "D,00:00:00:00,00:00:05:00,00:00:25:00,00:00:30:00", // 与 C 之间空隙 [19:00,25:00)
    "E,00:00:00:00,00:00:02:00,00:00:12:00,00:00:14:00", // 与 B 重叠（非相邻行）
  ].join("\n");
  const r = checkEdl(csv, "ndf25");

  assert.equal(r.dataRowCount, 5);
  assert.equal(r.durationIssues.length, 1);
  assert.equal(r.durationIssues[0].line, 3);
  assert.equal(r.durationIssues[0].diff, 12);

  assert.equal(r.gaps.length, 1);
  assert.deepEqual([r.gaps[0].startTc, r.gaps[0].endTc], ["00:00:19:00", "00:00:25:00"]);
  assert.equal(r.gaps[0].frames, 150);
  assert.equal(r.gaps[0].beforeLine, 4);
  assert.equal(r.gaps[0].afterLine, 5);

  // B×C、B×E 两对重叠（E 与 B 不相邻也要报出）
  assert.equal(r.overlaps.length, 2);
  const pairs = r.overlaps.map((o) => o.lines.join("x")).sort();
  assert.deepEqual(pairs, ["3x4", "3x6"]);
});

test("checkEdl: 拒绝跨午夜与零长度区间", () => {
  const csv = [
    "X,00:00:10:00,00:00:05:00,00:00:00:00,00:00:05:00", // 素材出点早于入点
    "Y,00:00:00:00,00:00:05:00,00:00:05:00,00:00:05:00", // 成片零长度
  ].join("\n");
  const r = checkEdl(csv, "ndf25");
  assert.equal(r.rows[0].errors.length, 1);
  assert.match(r.rows[0].errors[0], /跨午夜|零长度/);
  assert.equal(r.rows[1].errors.length, 1);
  assert.match(r.rows[1].errors[0], /跨午夜|零长度/);
});

test("checkEdl: 丢帧模式整单核对", () => {
  const csv = [
    "片段名,素材入点,素材出点,成片入点,成片出点",
    "A,00:00:00:00,00:01:00:02,00:00:00:00,00:01:00:02", // 1800f = 1800f
    "B,00:10:00:00,00:10:10:00,00:01:00:02,00:01:10:02", // 300f = 300f
  ].join("\n");
  const r = checkEdl(csv, "df2997");
  assert.equal(r.rows.every((row) => row.errors.length === 0), true);
  assert.equal(r.durationIssues.length, 0);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.overlaps.length, 0);
});

test("parseCsv: 引号字段与 CRLF", () => {
  const rows = parseCsv('"名称,含逗号",00:00:00:00,00:00:01:00,00:00:00:00,00:00:01:00\r\n第二行,00:00:00:00,00:00:01:00,00:00:00:00,00:00:01:00');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 5);
  assert.equal(rows[0][0], "名称,含逗号");
  assert.equal(rows[1][0], "第二行");
});
