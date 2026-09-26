'use strict';

/**
 * 时间码工具：HH:MM:SS:FF
 *
 * 支持两种模式（整份接片单统一选择）：
 *  - '25'      25 fps 非丢帧（PAL）：帧号 00–24，每帧连续计数
 *  - '2997df'  29.97 fps 丢帧（NTSC DF）：标称 30 fps，帧号 00–29；
 *      * 每个「丢帧分钟」（分钟号不能被 10 整除，且不是每小时的第 0 分钟）
 *        开头的两个帧号 00、01 不存在，该分钟直接从 MM:00:02 开始，共 1798 个实际帧；
 *      * 整十分钟（第 0、10、20… 分钟）不跳帧，共 1800 帧；
 *      * 每小时 107892 帧。
 *
 * 约定：区间为半开区间 [入点, 出点)，入点包含、出点不包含；
 * 不支持跨午夜（合法小时 00–23，出点必须严格晚于入点）。
 */

const MODES = {
  '25': { key: '25', fps: 25, dropFrame: false, label: '25 fps 非丢帧（PAL）' },
  '2997df': { key: '2997df', fps: 30, dropFrame: true, label: '29.97 fps 丢帧（NTSC DF）' },
};

// 小时允许 1~2 位，分/秒固定两位（00–59），帧固定两位（00–29，上界再按模式校验）
const TC_RE = /^(\d{1,2}):([0-5]\d):([0-5]\d):([0-2]\d)$/;

function getMode(key) {
  const mode = MODES[key];
  if (!mode) {
    throw new Error(`未知帧率模式：${key}（仅支持 25 / 2997df）`);
  }
  return mode;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * 丢帧分钟判定：第 1–9、11–19、21–29… 分钟（跨小时同理，即分钟总数不能被 10 整除）。
 * 第 0 分钟属于整十分钟块，不跳帧。
 */
function isDropMinute(totalMinutes) {
  return totalMinutes % 10 !== 0;
}

/**
 * 解析时间码字符串为绝对帧计数。
 * 返回 { ok:true, frames, h,m,s,f } 或 { ok:false, message }
 */
function parseTimecode(input, modeKey) {
  const mode = getMode(modeKey);
  const text = String(input ?? '').trim();

  const m = TC_RE.exec(text);
  if (!m) {
    return { ok: false, message: `时间码格式应为 HH:MM:SS:FF（00:00:00:00），实际为「${text || '空'}」` };
  }

  const h = Number(m[1]);
  const mm = Number(m[2]);
  const s = Number(m[3]);
  const f = Number(m[4]);

  if (h > 23) {
    return { ok: false, message: `小时 ${pad(h)} 超出范围（最大 23），不支持跨午夜时间码` };
  }
  if (f >= mode.fps) {
    return {
      ok: false,
      message: `帧号 ${pad(f)} 非法：${mode.label} 下帧号范围为 00–${pad(mode.fps - 1)}`,
    };
  }
  if (mode.dropFrame) {
    const totalMinutes = h * 60 + mm;
    // 仅丢帧分钟的「开头两个帧号」不存在：MM:00:00、MM:00:01
    if (isDropMinute(totalMinutes) && s === 0 && (f === 0 || f === 1)) {
      return {
        ok: false,
        message: `帧号 ${pad(f)} 在丢帧模式下不存在：第 ${mm} 分钟（非整十分钟）会跳过开头 00、01 帧号，该分钟从 ${pad(mm)}:00:02 开始`,
      };
    }
  }

  let frames;
  if (mode.dropFrame) {
    const totalMinutes = h * 60 + mm;
    // 每经过一个丢帧分钟少计 2 帧；到当前分钟为止共 floor(totalMinutes/10)*6...
    // 标准公式：frames = 标称30fps帧号 - 2*(totalMinutes - floor(totalMinutes/10))
    const nominal = (totalMinutes * 60 + s) * 30 + f;
    const skipped = 2 * (totalMinutes - Math.floor(totalMinutes / 10));
    frames = nominal - skipped;
  } else {
    frames = ((h * 60 + mm) * 60 + s) * mode.fps + f;
  }

  return { ok: true, frames, h, m: mm, s, f };
}

/**
 * 绝对帧计数 -> 时间码字符串（保证落在合法帧号上）
 */
function framesToTimecode(totalFrames, modeKey) {
  const mode = getMode(modeKey);
  const frames = Math.max(0, Math.floor(totalFrames));

  if (!mode.dropFrame) {
    let x = frames;
    const f = x % mode.fps;
    x = Math.floor(x / mode.fps);
    const s = x % 60;
    x = Math.floor(x / 60);
    const mm = x % 60;
    const h = Math.floor(x / 60);
    return `${pad(h)}:${pad(mm)}:${pad(s)}:${pad(f)}`;
  }

  // NTSC DF 反解：逐分钟扣减（整分钟 1800 帧 / 丢帧分钟 1798 帧），
  // 落入丢帧分钟后，开头两个标签不存在，整体向后平移 2 个标称帧位。
  const MAX_MINUTE = 24 * 60;
  let remaining = frames;
  let totalMinutes = 0;
  while (totalMinutes < MAX_MINUTE) {
    const size = isDropMinute(totalMinutes) ? 1798 : 1800;
    if (remaining < size) break;
    remaining -= size;
    totalMinutes++;
  }

  const onGrid = isDropMinute(totalMinutes) ? remaining + 2 : remaining;
  const f = onGrid % 30;
  const s = Math.floor(onGrid / 30);
  const h = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${pad(h)}:${pad(mm)}:${pad(s)}:${pad(f)}`;
}

module.exports = { MODES, getMode, parseTimecode, framesToTimecode, pad };
