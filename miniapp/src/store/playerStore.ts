import { create } from 'zustand'
import type { Episode } from '../api/podcast'
import type { LyricLine } from '../utils/lrcParser'

export interface Track {
  guid: string
  title: string
  artist: string
  cover?: string
  src: string
  summary?: string
  lyrics: LyricLine[]
}

interface PlayerState {
  track: Track | null
  /** 当前频道的单集列表，用于连播与锁屏上/下一首 */
  queue: Episode[]
  currentTime: number
  duration: number
  paused: boolean
  buffering: boolean
  rate: number
  error: string
  patch: (partial: Partial<Omit<PlayerState, 'patch'>>) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  track: null,
  queue: [],
  currentTime: 0,
  duration: 0,
  paused: true,
  buffering: false,
  rate: 1,
  error: '',
  patch: (partial) => set(partial),
}))
