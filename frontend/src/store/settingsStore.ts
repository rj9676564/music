import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PlayerSettings {
  fontSize: number;
  color: string;
  activeColor: string;
  backgroundColor: string;
  backgroundEffect: 'solid' | 'transparent' | 'transparentBlur';
  shadowOpacity: number;
  showDesktopLyric: boolean;
  loop: boolean;
  pauseOnHeadphoneDisconnect: boolean;
  lyricOffset: number; // in seconds, can be positive or negative
  audioDeviceId: string;
  apiUrl: string;
  showTranslation: boolean;
  arrowKeySeekMode: 'time' | 'sentence'; // 方向键控制方式：按时间 / 按句子
}

interface SettingsState extends PlayerSettings {
  updateSettings: (settings: Partial<PlayerSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fontSize: 32,
      color: '#ffffff',
      activeColor: '#ffeb3b',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundEffect: 'transparent',
      shadowOpacity: 0.1,
      showDesktopLyric: true,
      loop: false,
      pauseOnHeadphoneDisconnect: true,
      lyricOffset: 0,
      audioDeviceId: 'default',
      apiUrl: 'https://en.mrlb.cc.cd',
      showTranslation: true,
      arrowKeySeekMode: 'time',
      updateSettings: (newSettings) => {
        if (newSettings.apiUrl) {
          console.log('🌐 API URL Updated to:', newSettings.apiUrl);
        }
        console.log('--- Settings Store Updating ---', newSettings);
        set((state) => ({ ...state, ...newSettings }));
      },
    }),
    {
      name: 'player-settings-storage', // key in localStorage
      version: 1,
      migrate: (persistedState: any) => {
        if (
          !persistedState?.apiUrl ||
          persistedState.apiUrl === 'http://104.224.153.178:58081' ||
          persistedState.apiUrl === 'http://localhost:8080'
        ) {
          persistedState.apiUrl = 'https://en.mrlb.cc.cd';
        }
        return persistedState;
      },
    }
  )
);
