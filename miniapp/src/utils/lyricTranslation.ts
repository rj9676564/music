import { parseLrc, parseSrt } from './lrcParser'
import type { LyricLine } from './lrcParser'

/** 按内容自动识别 SRT / LRC */
export function parseLyrics(content: string): LyricLine[] {
  if (!content?.trim()) return []
  return content.includes('-->') ? parseSrt(content) : parseLrc(content)
}

/** 时间戳量化到 10ms */
const key = (time: number) => Math.round(time * 100)

/**
 * 把译文合并进原文歌词：优先按时间戳配对（±50ms），
 * 时间轴整体对不上且条数相等时才退回按下标配对。任何情况下都不丢弃原文行。
 */
export function mergeTranslation(base: LyricLine[], translationContent?: string): LyricLine[] {
  if (!translationContent?.trim() || base.length === 0) return base
  const translated = parseLyrics(translationContent)
  if (translated.length === 0) return base

  const byTime = new Map<number, string>()
  for (const line of translated) byTime.set(key(line.time), line.text)

  let matched = 0
  const lines = base.map((line) => {
    const k = key(line.time)
    for (const delta of [0, 1, -1, 2, -2, 5, -5]) {
      const text = byTime.get(k + delta)
      if (text !== undefined) {
        matched++
        return { ...line, translation: text }
      }
    }
    return line
  })

  if (matched / base.length >= 0.5) return lines
  if (translated.length === base.length) {
    return base.map((line, i) => ({ ...line, translation: translated[i].text }))
  }
  return base
}

/** 当前播放时间对应的歌词行下标（二分查找），未到第一句返回 -1 */
export function findLineIndex(lines: LyricLine[], time: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= time) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 秒 -> "1:02:03" / "13:20" */
export function formatTime(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
