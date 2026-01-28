import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PlayerSettings {
  fontSize: number;
  color: string;
  activeColor: string;
  backgroundColor: string;
  shadowOpacity: number;
  showDesktopLyric: boolean;
  loop: boolean;
  lyricOffset: number; // in seconds, can be positive or negative
  audioDeviceId: string;
  apiUrl: string;
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
      shadowOpacity: 0.1,
      showDesktopLyric: true,
      loop: false,
      lyricOffset: 0,
      audioDeviceId: 'default',
      apiUrl: 'http://localhost:8080',
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
