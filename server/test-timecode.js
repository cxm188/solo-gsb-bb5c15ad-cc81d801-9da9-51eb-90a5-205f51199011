'use strict';
const { parseTimecode, framesToTimecode } = require('./src/timecode');
const assert = require('assert');

// --- 29.97 DF 关键边界 ---
assert.strictEqual(parseTimecode('00:01:00:02', '2997df').frames, 1800);
assert.strictEqual(framesToTimecode(1800, '2997df'), '00:01:00:02');
assert.strictEqual(parseTimecode('00:00:59:29', '2997df').frames, 1799);
assert.strictEqual(framesToTimecode(1799, '2997df'), '00:00:59:29');
assert.strictEqual(parseTimecode('00:01:01:00', '2997df').frames, 1828);
assert.strictEqual(framesToTimecode(1828, '2997df'), '00:01:01:00');
assert.strictEqual(parseTimecode('00:01:59:29', '2997df').frames, 3597);
assert.strictEqual(framesToTimecode(3597, '2997df'), '00:01:59:29');

assert.strictEqual(parseTimecode('01:00:00:00', '2997df').frames, 107892);
assert.strictEqual(framesToTimecode(107892, '2997df'), '01:00:00:00');
assert.strictEqual(parseTimecode('00:10:00:00', '2997df').frames, 17982);
assert.strictEqual(framesToTimecode(17982, '2997df'), '00:10:00:00');
assert.strictEqual(parseTimecode('00:11:00:02', '2997df').frames, 19782);
assert.strictEqual(framesToTimecode(19782, '2997df'), '00:11:00:02');
assert.strictEqual(parseTimecode('02:00:00:00', '2997df').frames, 215784);
assert.strictEqual(framesToTimecode(215784, '2997df'), '02:00:00:00');
assert.strictEqual(
  framesToTimecode(parseTimecode('23:59:59:29', '2997df').frames, '2997df'),
  '23:59:59:29',
);

// 每小时帧数
assert.strictEqual(parseTimecode('01:00:00:00', '2997df').frames - parseTimecode('00:00:00:00', '2997df').frames, 107892);
// 整十分钟帧数
assert.strictEqual(parseTimecode('00:10:00:00', '2997df').frames, 17982);
// 丢帧分钟 1798 帧
assert.strictEqual(
  parseTimecode('00:02:00:02', '2997df').frames - parseTimecode('00:01:00:02', '2997df').frames,
  1798,
);
// 59:29 -> 下一分钟 :02 仅 1 帧
assert.strictEqual(
  parseTimecode('00:01:00:02', '2997df').frames - parseTimecode('00:00:59:29', '2997df').frames,
  1,
);
// 59:29 -> 下一秒 00 合法且仅 1 帧（秒内不丢帧）
assert.strictEqual(
  parseTimecode('00:00:59:29', '2997df').frames - parseTimecode('00:00:58:29', '2997df').frames,
  30,
);

// 丢帧规则：只有丢帧分钟开头的 00、01 不存在
assert.ok(!parseTimecode('00:01:00:00', '2997df').ok, '丢帧分钟 :00:00 非法');
assert.ok(!parseTimecode('00:01:00:01', '2997df').ok, '丢帧分钟 :00:01 非法');
assert.ok(parseTimecode('00:01:01:00', '2997df').ok, '非开头秒的帧号 00 合法');
assert.ok(parseTimecode('00:01:01:01', '2997df').ok, '非开头秒的帧号 01 合法');
assert.ok(parseTimecode('00:00:00:00', '2997df').ok, '第 0 分钟 :00 合法');
assert.ok(parseTimecode('00:00:00:01', '2997df').ok, '第 0 分钟 :01 合法');
assert.ok(parseTimecode('00:10:00:00', '2997df').ok, '整十分钟 :00 合法');
assert.ok(parseTimecode('00:10:00:01', '2997df').ok, '整十分钟 :01 合法');
assert.ok(parseTimecode('00:20:00:01', '2997df').ok, '整十分钟 :01 合法');
assert.ok(!parseTimecode('00:21:00:01', '2997df').ok, '非整十分钟开头 :01 非法');
assert.ok(parseTimecode('01:01:00:02', '2997df').ok, '跨小时的丢帧分钟 :02 合法');
assert.ok(!parseTimecode('01:01:00:01', '2997df').ok, '跨小时的丢帧分钟开头 :01 非法');
assert.ok(parseTimecode('00:00:00:29', '2997df').ok, '帧号 29 合法（每秒最后一帧）');
assert.ok(!parseTimecode('00:00:00:30', '2997df').ok, '帧号 30 非法');

// --- 25 fps ---
assert.ok(!parseTimecode('00:00:00:25', '25').ok);
assert.ok(parseTimecode('00:00:00:24', '25').ok);
assert.strictEqual(framesToTimecode(0, '25'), '00:00:00:00');
assert.strictEqual(framesToTimecode(25, '25'), '00:00:01:00');
assert.strictEqual(framesToTimecode(90000, '25'), '01:00:00:00');
assert.strictEqual(parseTimecode('01:00:00:00', '25').frames, 90000);

// --- 通用格式 / 范围校验 ---
assert.ok(!parseTimecode('24:00:00:00', '25').ok, '24 点非法');
assert.ok(parseTimecode('23:59:59:24', '25').ok);
assert.ok(!parseTimecode('1:2:3:4', '25').ok, '必须两位补零');
assert.ok(!parseTimecode('00:00:60:00', '25').ok, '秒 60 非法');
assert.ok(!parseTimecode('00:60:00:00', '25').ok, '分 60 非法');
assert.ok(!parseTimecode('abc', '25').ok, '乱码非法');
assert.ok(!parseTimecode('', '25').ok, '空字符串非法');

// --- 全空间往返（两种模式，24 小时全部帧空间） ---
for (const mode of ['25', '2997df']) {
  const max = mode === '25' ? 25 * 3600 * 24 : 107892 * 24;
  for (let f = 0; f < max; f += 997) {
    const tc = framesToTimecode(f, mode);
    const back = parseTimecode(tc, mode);
    assert.ok(back.ok, `${tc} 在 ${mode} 下应合法`);
    assert.strictEqual(back.frames, f, `${mode} 往返失败 @ ${f} -> ${tc}`);
  }
  assert.strictEqual(framesToTimecode(max - 1, mode).slice(0, 2), '23');
}

// DF：逐帧反解结果必须全部合法（不落在被跳过的标签上）
for (let f = 0; f < 107892 * 24; f += 1) {
  const tc = framesToTimecode(f, '2997df');
  assert.ok(parseTimecode(tc, '2997df').ok, `反解产生非法时间码 @ ${f} -> ${tc}`);
}

// DF 时长与 25fps 模式互不影响：同一文本在两种模式帧数不同
assert.notStrictEqual(
  parseTimecode('00:01:00:02', '2997df').frames,
  parseTimecode('00:01:00:02', '25').frames,
);

console.log('timecode tests passed');
