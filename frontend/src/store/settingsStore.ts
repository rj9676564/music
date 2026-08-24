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
  llmApiKey: string;
  llmApiBase: string;
  llmModel: string;
  showTranslation: boolean;
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
      apiUrl: 'http://104.224.153.178:58081',
      llmApiKey: '',
      llmApiBase: 'https://api.moonshot.cn/v1',
      llmModel: 'moonshot-v1-8k',
      showTranslation: true,
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
    }
  )
);
