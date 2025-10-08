import type { EkfParams } from '../math/eskf';
import type { ZuptParams } from '../math/zupt';
import type { ConstraintConfig } from '../math/constraints';
import type { MountPreset } from '../bar/mountPresets';
import type { RepCounterConfig } from '../reps/barbell';
import { DEFAULT_REP_CONFIG } from '../reps/barbell';

export interface UserPreferences {
  ekf_params: EkfParams;
  zupt_params: ZuptParams;
  workout_preferences: {
    maxAngle: number;
    minROM: number;
    restTimer: boolean;
  };
  device_settings: {
    sampleRate: string;
    autoCalibrate: boolean;
  };
  bar_settings: {
    preset: MountPreset;
    calibrationless: boolean;
  };
  constraint_settings: ConstraintConfig;
  accel_cutoff: number;
  rep_counter_config: RepCounterConfig;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  ekf_params: {
    Qv: 0.0005,
    Qba: 0.000001,
    Rv: 0.0002,
    Ry: 0.005
  },
  zupt_params: {
    a_thr: 0.06,
    w_thr: 0.06,
    minHoldMs: 200
  },
  workout_preferences: {
    maxAngle: 25,
    minROM: 30,
    restTimer: true
  },
  device_settings: {
    sampleRate: '20',
    autoCalibrate: true
  },
  bar_settings: {
    preset: 'X_along_bar_Z_up',
    calibrationless: true
  },
  constraint_settings: {
    type: 'verticalPlane',
    axis: 'y'
  },
  accel_cutoff: 3.5,
  rep_counter_config: DEFAULT_REP_CONFIG
};

const STORAGE_KEY = 'userPreferences';

export async function loadUserPreferences(): Promise<UserPreferences> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      console.log('[Preferences] No saved preferences, using defaults');
      return DEFAULT_PREFERENCES;
    }

    const parsed = JSON.parse(stored);
    console.log('[Preferences] Loaded preferences from localStorage');

    return {
      ekf_params: parsed.ekf_params || DEFAULT_PREFERENCES.ekf_params,
      zupt_params: parsed.zupt_params || DEFAULT_PREFERENCES.zupt_params,
      workout_preferences: parsed.workout_preferences || DEFAULT_PREFERENCES.workout_preferences,
      device_settings: parsed.device_settings || DEFAULT_PREFERENCES.device_settings,
      bar_settings: parsed.bar_settings || DEFAULT_PREFERENCES.bar_settings,
      constraint_settings: parsed.constraint_settings || DEFAULT_PREFERENCES.constraint_settings,
      accel_cutoff: parsed.accel_cutoff ?? DEFAULT_PREFERENCES.accel_cutoff,
      rep_counter_config: parsed.rep_counter_config || DEFAULT_PREFERENCES.rep_counter_config
    };
  } catch (err) {
    console.error('[Preferences] Error loading preferences:', err);
    return DEFAULT_PREFERENCES;
  }
}

export async function saveUserPreferences(preferences: Partial<UserPreferences>): Promise<boolean> {
  try {
    const current = await loadUserPreferences();
    const updated = { ...current, ...preferences };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('[Preferences] Saved preferences to localStorage');
    return true;
  } catch (err) {
    console.error('[Preferences] Error saving preferences:', err);
    return false;
  }
}

export async function updateEKFParams(params: Partial<EkfParams>): Promise<boolean> {
  const current = await loadUserPreferences();
  return saveUserPreferences({
    ekf_params: { ...current.ekf_params, ...params }
  });
}

export async function updateZUPTParams(params: Partial<ZuptParams>): Promise<boolean> {
  const current = await loadUserPreferences();
  return saveUserPreferences({
    zupt_params: { ...current.zupt_params, ...params }
  });
}

export async function updateWorkoutPreferences(prefs: Partial<UserPreferences['workout_preferences']>): Promise<boolean> {
  const current = await loadUserPreferences();
  return saveUserPreferences({
    workout_preferences: { ...current.workout_preferences, ...prefs }
  });
}

export async function updateDeviceSettings(settings: Partial<UserPreferences['device_settings']>): Promise<boolean> {
  const current = await loadUserPreferences();
  return saveUserPreferences({
    device_settings: { ...current.device_settings, ...settings }
  });
}

export async function updateBarSettings(settings: Partial<UserPreferences['bar_settings']>): Promise<boolean> {
  const current = await loadUserPreferences();
  return saveUserPreferences({
    bar_settings: { ...current.bar_settings, ...settings }
  });
}

export async function updateConstraintSettings(constraint: ConstraintConfig): Promise<boolean> {
  return saveUserPreferences({
    constraint_settings: constraint
  });
}

export async function updateAccelCutoff(cutoff: number): Promise<boolean> {
  return saveUserPreferences({
    accel_cutoff: cutoff
  });
}

export async function updateRepCounterConfig(config: RepCounterConfig): Promise<boolean> {
  return saveUserPreferences({
    rep_counter_config: config
  });
}
