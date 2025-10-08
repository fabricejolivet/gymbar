import { create } from 'zustand';
import type { MountPreset } from '../core/bar/mountPresets';
import { DEFAULT_MOUNT_PRESET } from '../core/bar/mountPresets';

interface BarState {
  preset: MountPreset;
  calibrationless: boolean;
  setPreset: (preset: MountPreset) => void;
  setCalibrationless: (enabled: boolean) => void;
}

export const useBarStore = create<BarState>((set) => ({
  preset: DEFAULT_MOUNT_PRESET,
  calibrationless: true,
  setPreset: (preset) => set({ preset }),
  setCalibrationless: (enabled) => set({ calibrationless: enabled })
}));
