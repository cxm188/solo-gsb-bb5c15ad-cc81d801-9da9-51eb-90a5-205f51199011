/**
 * 时间码核心逻辑。
 *
 * 支持两种帧率模式：
 *  - ndf25  ：25fps 非丢帧，帧号 00-24 连续编号。
 *  - df2997 ：29.97fps 丢帧（按 30fps 标称计数），帧号 00-29；
 *            每分钟跳过 00、01 两个帧号，但整十分钟（MM % 10 === 0）不跳。
 *
 * 时间码格式 HH:MM:SS:FF。入点包含、出点不包含；
 * 帧数与帧号之间的换算均以「实际帧数」（自 00:00:00:00 起经过的帧）为准。
 */

export type Mode = "ndf25" | "df2997";

export const MODE_LABEL: Record<Mode, string> = {
  ndf25: "25fps 非丢帧",
  df2997: "29.97fps 丢帧",
};

export function nominalFps(mode: Mode): number {
  return mode === "ndf25" ? 25 : 30;
}

/** 丢帧模式：每 10 分钟的实际帧数 = 30*600 - 2*9 = 17982 */
const DF_FRAMES_PER_10_MIN = 17982;
/** 丢帧模式：整十分钟那一分钟的实际帧数 = 30*60 = 1800 */
const DF_FRAMES_PER_FULL_MIN = 1800;
/** 丢帧模式：普通分钟（跳 2 帧）的实际帧数 = 30*60 - 2 = 1798 */
const DF_FRAMES_PER_DROP_MIN = 1798;

const TC_RE = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/;

/**
 * 解析时间码为自 00:00:00:00 起的实际帧数。
 * 非法格式、越界字段、丢帧模式下不存在的帧号都会抛出中文错误信息。
 */
export function parseTimecode(raw: string, mode: Mode): number {
  const tc = raw.trim();
  const m = TC_RE.exec(tc);
  if (!m) {
    throw new Error(`时间码格式错误「${tc}」，应为 HH:MM:SS:FF（如 01:23:45:12）`);
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ff = Number(m[4]);
  const fps = nominalFps(mode);

  if (hh > 23) {
    throw new Error(`小时超出范围（00-23）：「${tc}」，不支持跨午夜区间`);
  }
  if (mm > 59) {
    throw new Error(`分钟超出范围（00-59）：「${tc}」`);
  }
  if (ss > 59) {
    throw new Error(`秒超出范围（00-59）：「${tc}」`);
  }
  if (ff >= fps) {
    throw new Error(`帧号超出范围（${MODE_LABEL[mode]}下应为 00-${fps - 1}）：「${tc}」`);
  }
  if (mode === "df2997" && ss === 0 && mm % 10 !== 0 && (ff === 0 || ff === 1)) {
    throw new Error(
      `丢帧模式下不存在的帧号：「${tc}」（每分钟第 0 秒跳过 00、01 帧号，整十分钟除外）`
    );
  }

  const totalMinutes = hh * 60 + mm;
  const nominal = (totalMinutes * 60 + ss) * fps + ff;
  if (mode === "df2997") {
    // 每分钟丢 2 个帧号，整十分钟不丢
    return nominal - 2 * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return nominal;
}

/**
 * 将实际帧数换算回时间码字符串（HH:MM:SS:FF）。
 * 结果保证是合法帧号（丢帧模式下不会产出被跳过的 00/01）。
 */
export function formatTimecode(frames: number, mode: Mode): string {
  if (!Number.isFinite(frames) || frames < 0) {
    throw new Error(`帧数必须为非负整数：${frames}`);
  }
  const f = Math.floor(frames);
  const fps = nominalFps(mode);
  let hh: number, mm: number, ss: number, ff: number;

  if (mode === "df2997") {
    const tenMinBlocks = Math.floor(f / DF_FRAMES_PER_10_MIN);
    const remInBlock = f % DF_FRAMES_PER_10_MIN;
    let minuteInBlock: number;
    let rem: number;
    if (remInBlock < DF_FRAMES_PER_FULL_MIN) {
      // 整十分钟那一分钟：不跳帧号
      minuteInBlock = 0;
      rem = remInBlock;
    } else {
      // 普通分钟：每分钟开头补回被跳过的 2 个帧号
      minuteInBlock = 1 + Math.floor((remInBlock - DF_FRAMES_PER_FULL_MIN) / DF_FRAMES_PER_DROP_MIN);
      rem = ((remInBlock - DF_FRAMES_PER_FULL_MIN) % DF_FRAMES_PER_DROP_MIN) + 2;
    }
    const totalMinutes = tenMinBlocks * 10 + minuteInBlock;
    hh = Math.floor(totalMinutes / 60);
    mm = totalMinutes % 60;
    ss = Math.floor(rem / fps);
    ff = rem % fps;
  } else {
    ff = f % fps;
    const totalSeconds = Math.floor(f / fps);
    ss = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    mm = totalMinutes % 60;
    hh = Math.floor(totalMinutes / 60);
  }

  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}
