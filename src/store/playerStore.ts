import { create } from 'zustand';
import type { LyricLine } from '../utils/lrcParser';

interface MusicInfo {
  name: string;
  artist: string;
}

interface PlayerState {
  audioPath: string | null;
  musicInfo: MusicInfo;
  lyrics: LyricLine[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activeIndex: number;
  isTranscribing: boolean;
  
  setAudio: (path: string, info: MusicInfo) => void;
  setLyrics: (lyrics: LyricLine[]) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setActiveIndex: (index: number) => void;
  setTranscribing: (status: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  audioPath: null,
  musicInfo: { name: '未选择歌曲', artist: '未知艺术家' },
  lyrics: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  activeIndex: -1,
  isTranscribing: false,

  setAudio: (path, info) => set({ audioPath: path, musicInfo: info, isPlaying: false, currentTime: 0 }),
  setLyrics: (lyrics) => set({ lyrics }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setTranscribing: (isTranscribing) => set({ isTranscribing }),
}));
