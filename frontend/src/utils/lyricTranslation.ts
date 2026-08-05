import { parseSrt } from "./lrcParser";
import type { LyricLine } from "./lrcParser";

/** 译文相对原文的字号比例。主窗口歌词列表与桌面歌词悬浮窗共用。 */
export const TRANSLATION_FONT_SCALE = 0.72;

export type MergeStrategy = "timestamp" | "index" | "none";

export interface MergeResult {
  lines: LyricLine[];
  matched: number;
  total: number;
  strategy: MergeStrategy;
}

/** 时间戳量化到 10ms，与 parseSrt 内部去重用的精度保持一致 */
const key = (time: number) => Math.round(time * 100);

/**
 * 把译文 SRT 合并进已解析的原文歌词。
 *
 * 优先按时间戳配对而不是按下标：parseSrt 会丢弃空文本的字幕块、并合并时间戳
 * 相同的块，所以两边条数不一定相等 —— 而条数不等恰恰发生在某个批次翻译失败时，
 * 这时按下标配对会让缺口之后的每一行都错位，且完全静默。
 *
 * 任何情况下都不会丢弃或重排原文行；配不上的行保持无译文。
 */
export function mergeTranslation(
  base: LyricLine[],
  translationSrt: string,
): MergeResult {
  const total = base.length;
  if (!translationSrt?.trim() || total === 0) {
    return { lines: base, matched: 0, total, strategy: "none" };
  }

  const translated = parseSrt(translationSrt);
  if (translated.length === 0) {
    return { lines: base, matched: 0, total, strategy: "none" };
  }

  const byTime = new Map<number, string>();
  for (const line of translated) {
    byTime.set(key(line.time), line.text);
  }

  let matched = 0;
  const lines = base.map((line) => {
    const k = key(line.time);
    // 精确命中，然后放宽到 ±50ms
    for (const delta of [0, 1, -1, 2, -2, 5, -5]) {
      const text = byTime.get(k + delta);
      if (text !== undefined) {
        matched++;
        return { ...line, translation: text };
      }
    }
    return line;
  });

  if (matched / total >= 0.5) {
    return { lines, matched, total, strategy: "timestamp" };
  }

  // 时间轴整体对不上（例如译文被重新计时），条数相等时才退回按下标配对
  if (translated.length === total) {
    return {
      lines: base.map((line, i) => ({ ...line, translation: translated[i].text })),
      matched: total,
      total,
      strategy: "index",
    };
  }

  return { lines: base, matched: 0, total, strategy: "none" };
}
