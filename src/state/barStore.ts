import { create } from 'zustand';
import type { MountPreset } from '../core/bar/mountPresets';
import { DEFAULT_MOUNT_PRESET } from '../core/bar/mountPresets';
import { updateBarSettings } from '../core/services/preferencesService';

interface BarState {
  preset: MountPreset;
  calibrationless: boolean;
  setPreset: (preset: MountPreset, skipSave?: boolean) => void;
  setCalibrationless: (enabled: boolean, skipSave?: boolean) => void;
}

export const useBarStore = create<BarState>((set, get) => ({
  preset: DEFAULT_MOUNT_PRESET,
  calibrationless: true,
  setPreset: (preset, skipSave = false) => {
    set({ preset });
    if (!skipSave) {
      updateBarSettings({ preset }).catch(err => console.error('[BarStore] Failed to save preset:', err));
    }
  },
  setCalibrationless: (enabled, skipSave = false) => {
    set({ calibrationless: enabled });
    if (!skipSave) {
      updateBarSettings({ calibrationless: enabled }).catch(err => console.error('[BarStore] Failed to save calibrationless:', err));
    }
  }
}));

export async function initBarStoreFromPreferences() {
  try {
    const { loadUserPreferences } = await import('../core/services/preferencesService');
    const prefs = await loadUserPreferences();

    const store = useBarStore.getState();
    store.setPreset(prefs.bar_settings.preset, true);
    store.setCalibrationless(prefs.bar_settings.calibrationless, true);

    console.log('[BarStore] Loaded preferences from database');
  } catch (err) {
    console.error('[BarStore] Failed to load preferences:', err);
  }
}
