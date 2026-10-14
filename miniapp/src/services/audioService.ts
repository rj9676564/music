import Taro from '@tarojs/taro'
import { episodeImageUrl, resolveAudioUrl } from '../api/podcast'
import type { Episode } from '../api/podcast'
import { usePlayerStore } from '../store/playerStore'
import type { Track } from '../store/playerStore'
import { mergeTranslation, parseLyrics } from '../utils/lyricTranslation'

/**
 * 对 BackgroundAudioManager 的唯一封装：UI 与 store 只依赖这里。
 * - 后台/锁屏播放必须用 BackgroundAudioManager，且 app.config 需声明 requiredBackgroundModes: ['audio']
 * - 给 src 赋值即自动开始播放，且必须先设置 title，所以起播逻辑集中在 playTrack
 * - onTimeUpdate 约 250ms 一次，息屏后 JS 可能被挂起，因此不要在这里做依赖精确时序的逻辑
 */

const POS_KEY = (guid: string) => `pos-${guid}`
const RATE_KEY = 'play-rate'
const SAVE_INTERVAL_MS = 5000

let bam: Taro.BackgroundAudioManager | null = null
let lastSavedAt = 0

const store = () => usePlayerStore.getState()

export function loadSavedPosition(guid: string): number {
  try {
    return Number(Taro.getStorageSync(POS_KEY(guid))) || 0
  } catch {
    return 0
  }
}

function savePosition(force = false) {
  const { track, currentTime } = store()
  if (!track) return
  const now = Date.now()
  if (!force && now - lastSavedAt < SAVE_INTERVAL_MS) return
  lastSavedAt = now
  try {
    Taro.setStorageSync(POS_KEY(track.guid), currentTime)
  } catch {
    // 存储不可用时静默忽略，不影响播放
  }
}

function playAdjacent(offset: number) {
  const { track, queue } = store()
  if (!track) return
  const idx = queue.findIndex((e) => e.guid === track.guid)
  const next = idx >= 0 ? queue[idx + offset] : undefined
  if (next) playEpisode(next, queue)
}

/** 在 App 启动时调用一次，绑定播放器事件 */
export function initAudioService() {
  if (bam) return
  bam = Taro.getBackgroundAudioManager()

  try {
    const rate = Number(Taro.getStorageSync(RATE_KEY))
    if (rate > 0) store().patch({ rate })
  } catch {
    // ignore
  }

  bam.onPlay(() => store().patch({ paused: false, buffering: false, error: '' }))
  bam.onPause(() => {
    store().patch({ paused: true })
    savePosition(true)
  })
  bam.onStop(() => {
    store().patch({ paused: true })
    savePosition(true)
  })
  bam.onWaiting(() => store().patch({ buffering: true }))
  bam.onCanplay(() => {
    store().patch({ buffering: false })
    if (bam && bam.duration) store().patch({ duration: bam.duration })
  })
  bam.onTimeUpdate(() => {
    if (!bam) return
    store().patch({ currentTime: bam.currentTime, duration: bam.duration || store().duration })
    savePosition()
  })
  bam.onEnded(() => {
    savePosition(true)
    try {
      Taro.removeStorageSync(POS_KEY(store().track?.guid || ''))
    } catch {
      // ignore
    }
    store().patch({ paused: true, currentTime: 0 })
    playAdjacent(1)
  })
  bam.onError(() => store().patch({ paused: true, buffering: false, error: '音频加载失败，请检查网络' }))
  // 锁屏 / 耳机控制（iOS 为主，Android 视机型）
  bam.onNext(() => playAdjacent(1))
  bam.onPrev(() => playAdjacent(-1))
}

function buildTrack(ep: Episode): Track {
  const base = parseLyrics(ep.lrc_content || ep.srt_content || '')
  const lyrics = mergeTranslation(base, ep.lrc_content ? ep.lrc_translation : ep.translation)
  return {
    guid: ep.guid,
    title: ep.title || '未命名',
    artist: '',
    cover: episodeImageUrl(ep.guid),
    src: resolveAudioUrl(ep),
    summary: ep.summary,
    lyrics,
  }
}

/** 起播一集；同一集已在播放时不重置，直接返回 */
export function playEpisode(ep: Episode, queue: Episode[] = [], artist = '') {
  if (!bam) initAudioService()
  const cur = store().track
  if (cur && cur.guid === ep.guid) {
    if (store().paused) bam?.play()
    return
  }

  const track = buildTrack(ep)
  track.artist = artist || cur?.artist || ''
  if (!track.src) {
    store().patch({ error: '该单集没有可用的音频地址' })
    return
  }

  const startTime = loadSavedPosition(ep.guid)
  store().patch({
    track,
    queue: queue.length ? queue : store().queue,
    currentTime: startTime,
    duration: ep.duration || 0,
    paused: false,
    buffering: true,
    error: '',
  })

  const m = bam!
  m.title = track.title
  m.singer = track.artist || ' '
  if (track.cover) m.coverImgUrl = track.cover
  m.startTime = startTime
  // 先于 src 设置倍速，避免起播后才变速
  m.playbackRate = store().rate
  m.src = track.src
}

export function togglePlay() {
  if (!bam || !store().track) return
  if (store().paused) bam.play()
  else bam.pause()
}

export function seekTo(seconds: number) {
  if (!bam || !store().track) return
  const t = Math.max(0, Math.min(seconds, store().duration || seconds))
  bam.seek(t)
  store().patch({ currentTime: t })
}

export function seekBy(delta: number) {
  seekTo(store().currentTime + delta)
}

export function setRate(rate: number) {
  store().patch({ rate })
  if (bam) bam.playbackRate = rate
  try {
    Taro.setStorageSync(RATE_KEY, rate)
  } catch {
    // ignore
  }
}

export const playNext = () => playAdjacent(1)
export const playPrev = () => playAdjacent(-1)
