import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PlayerSettings {
  fontSize: number;
  color: string;
  activeColor: string;
  backgroundColor: string;
  showDesktopLyric: boolean;
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
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      showDesktopLyric: true,
      updateSettings: (newSettings) => {
        console.log('--- Settings Store Updating ---', newSettings);
        set((state) => ({ ...state, ...newSettings }));
      },
    }),
    {
      name: 'player-settings-storage', // key in localStorage
    }
  )
);
