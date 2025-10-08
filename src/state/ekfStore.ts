/**
 * EKF Store - State management for ESKF-based positioning
 *
 * Integrates the new literature-grounded ESKF with:
 * - Mechanization (body→ENU transformation with low-pass filtering)
 * - ZUPT detection and velocity updates
 * - Motion constraints (planar, line-vertical)
 * - Auto-initialization from first stationary period
 */

import { create } from 'zustand';
import {
  ekfInit,
  ekfPredict,
  ekfZuptUpdate,
  ekfPlanarUpdate,
  ekfLineVerticalUpdate,
  DEFAULT_EKF_PARAMS,
  type EkfState,
  type EkfParams
} from '../core/math/eskf';
import {
  bodyToEnuAccelEuler,
  toImu20,
  initMechanization,
  resetMechanization
} from '../core/math/mechanization';
import { ZuptDetector, DEFAULT_ZUPT_PARAMS, type ZuptParams } from '../core/math/zupt';
import { type ConstraintConfig } from '../core/math/constraints';
import { useStreamStore } from './streamStore';
import { updateEKFParams, updateZUPTParams, updateConstraintSettings } from '../core/services/preferencesService';

interface EKFStoreState {
  // State and parameters
  state: EkfState & {
    p: [number, number, number];
    v: [number, number, number];
  };
  ekfParams: EkfParams;
  zuptParams: ZuptParams;
  constraint: ConstraintConfig;

  // Initialization
  isInitialized: boolean;
  initStatus: 'uninitialized' | 'waiting' | 'initialized';
  anchorXY: [number, number];
  positionOffset: [number, number, number];

  // Status
  zuptActive: boolean;
  lastTimestamp: number | null;

  // Performance metrics
  loopHz: number;
  dtJitter: number;
  gyroMagnitude: number;
  accelMagnitude: number;

  // Internal
  zuptDetector: ZuptDetector;
  isLoadingPreferences: boolean;

  // Actions
  reset: () => void;
  setEkfParams: (params: Partial<EkfParams>, skipSave?: boolean) => void;
  setZuptParams: (params: Partial<ZuptParams>, skipSave?: boolean) => void;
  setConstraint: (constraint: ConstraintConfig, skipSave?: boolean) => void;
  setConfig: (config: Partial<EkfParams>) => void; // Alias for compatibility
  setPositionOffset: (position: [number, number, number]) => void;
  getRelativePosition: () => [number, number, number];
  processSample: (sample: {
    accel_g: [number, number, number];
    gyro_dps: [number, number, number];
    euler_deg: [number, number, number];
    timestamp_ms: number;
  }) => void;
}

// Helper to create a state with compatibility properties
function createStateWithGetters(ekfState: EkfState): EkfState & {
  p: [number, number, number];
  v: [number, number, number];
} {
  return {
    ...ekfState,
    get p(): [number, number, number] {
      return [this.x[0], this.x[1], this.x[2]];
    },
    get v(): [number, number, number] {
      return [this.x[3], this.x[4], this.x[5]];
    }
  };
}

export const useEKFStore = create<EKFStoreState>((set, get) => {
  /**
   * Fixed parameters optimized for 20Hz IMU sampling:
   * - Mechanization cutoff: 3.5Hz removes high-frequency noise while preserving barbell dynamics
   * - No post-EKF velocity filtering: EKF process noise provides sufficient smoothing
   */
  initMechanization(3.5);

  const zuptDetector = new ZuptDetector(DEFAULT_ZUPT_PARAMS);

  return {
    // State and parameters
    state: createStateWithGetters(ekfInit()),
    ekfParams: DEFAULT_EKF_PARAMS,
    zuptParams: DEFAULT_ZUPT_PARAMS,
    constraint: { type: 'verticalPlane', axis: 'y' },

    // Initialization
    isInitialized: false,
    initStatus: 'uninitialized',
    anchorXY: [0, 0],
    positionOffset: [0, 0, 0],

    // Status
    zuptActive: false,
    lastTimestamp: null,

    // Performance metrics
    loopHz: 0,
    dtJitter: 0,
    gyroMagnitude: 0,
    accelMagnitude: 0,

    // Internal
    zuptDetector,
    isLoadingPreferences: false,

    reset: () => {
      resetMechanization();
      useStreamStore.getState().clearBuffer();
      get().zuptDetector.reset();

      set({
        state: createStateWithGetters(ekfInit()),
        isInitialized: false,
        initStatus: 'uninitialized',
        anchorXY: [0, 0],
        positionOffset: [0, 0, 0],
        zuptActive: false,
        lastTimestamp: null,
        loopHz: 0,
        dtJitter: 0,
        gyroMagnitude: 0,
        accelMagnitude: 0
      });
    },

    setPositionOffset: (position) => {
      set({ positionOffset: position });
    },

    setEkfParams: (params, skipSave = false) => {
      const newParams = { ...get().ekfParams, ...params };
      set({ ekfParams: newParams });
      if (!skipSave) {
        updateEKFParams(params).catch(err => console.error('[EKFStore] Failed to save EKF params:', err));
      }
    },

    setZuptParams: (params, skipSave = false) => {
      const newParams = { ...get().zuptParams, ...params };
      get().zuptDetector.setParams(newParams);
      set({ zuptParams: newParams });
      if (!skipSave) {
        updateZUPTParams(params).catch(err => console.error('[EKFStore] Failed to save ZUPT params:', err));
      }
    },

    setConstraint: (constraint, skipSave = false) => {
      set({ constraint });
      if (!skipSave) {
        updateConstraintSettings(constraint).catch(err => console.error('[EKFStore] Failed to save constraint settings:', err));
      }
    },

    setConfig: (config) => {
      // Compatibility with old interface - maps to setEkfParams
      set({ ekfParams: { ...get().ekfParams, ...config } });
    },

    getRelativePosition: () => {
      const { state, anchorXY } = get();
      return [
        state.x[0] - anchorXY[0],
        state.x[1] - anchorXY[1],
        state.x[2]
      ];
    },

    processSample: (sample) => {
      try {
        const {
          state,
          ekfParams,
          constraint,
          lastTimestamp,
          isInitialized,
          zuptDetector
        } = get();

        // Validate sample
        if (!sample || !sample.accel_g || !sample.gyro_dps || !sample.euler_deg) {
          return;
        }

        const t = sample.timestamp_ms;

        // Convert to Imu20 format
        const imu = toImu20(t, sample.accel_g, sample.gyro_dps, sample.euler_deg);

      // Compute gyro and accel magnitudes for metrics
      const gyroMag = Math.sqrt(
        imu.gyro_rads[0] ** 2 +
        imu.gyro_rads[1] ** 2 +
        imu.gyro_rads[2] ** 2
      );

      // Mechanization: body→ENU with gravity removal and low-pass
      const a_enu = bodyToEnuAccelEuler(imu);

      const accelMag = Math.sqrt(
        a_enu[0] ** 2 +
        a_enu[1] ** 2 +
        a_enu[2] ** 2
      );

      // Add to ZUPT buffer
      const streamStore = useStreamStore.getState();
      streamStore.addSample({
        a_enu,
        gyro: imu.gyro_rads,
        timestamp_ms: t
      });

      // Handle first sample
      if (lastTimestamp === null) {
        set({
          lastTimestamp: t,
          gyroMagnitude: gyroMag,
          accelMagnitude: accelMag
        });
        return;
      }

      // Compute dt
      const dt = (t - lastTimestamp) / 1000;

      // Sanity check dt
      if (dt <= 0 || dt > 0.2) {
        console.warn('[ESKF] Skipping sample - invalid dt:', dt);
        set({ lastTimestamp: t });
        return;
      }

      // Performance metrics with smoothing
      const instantHz = 1 / dt;
      const alpha = 0.1; // EMA smoothing factor
      const currentLoopHz = get().loopHz;
      const loopHz = currentLoopHz === 0 ? instantHz : currentLoopHz * (1 - alpha) + instantHz * alpha;
      const dtJitter = Math.abs(dt - 0.05); // Expected 50ms

      // EKF Prediction
      let newState = ekfPredict(state, dt, a_enu, ekfParams);

      // NOTE: Velocity filtering removed - EKF process noise provides smoothing
      // Post-filter was causing instability when combined with forced ZUPT resets

      // ZUPT Detection and Update
      const buffer = streamStore.getBuffer();
      const zuptActive = zuptDetector.detect(
        { a_enu, gyro: imu.gyro_rads, timestamp_ms: t },
        buffer
      );

      if (zuptActive) {
        const vBefore = Math.sqrt(
          newState.x[3] ** 2 + newState.x[4] ** 2 + newState.x[5] ** 2
        );

        newState = ekfZuptUpdate(newState, ekfParams);

        // CRITICAL FIX: Force velocity to exactly zero during ZUPT
        // The Kalman update may leave residual velocity due to filter lag.
        // Enforcing zero prevents drift.
        newState.x[3] = 0;
        newState.x[4] = 0;
        newState.x[5] = 0;

        // CRITICAL: Also zero velocity covariance to prevent drift
        // Indices 3,4,5 are velocity components in the 9x9 covariance matrix
        for (let i = 3; i < 6; i++) {
          for (let j = 0; j < 9; j++) {
            newState.P[i * 9 + j] = 0;
            newState.P[j * 9 + i] = 0;
          }
        }

        const vAfter = Math.sqrt(
          newState.x[3] ** 2 + newState.x[4] ** 2 + newState.x[5] ** 2
        );

        if ((Date.now() % 5000) < 50) { // Log less frequently
          console.log(
            '[ESKF] ZUPT applied - v:',
            (vBefore * 100).toFixed(1), '→',
            (vAfter * 100).toFixed(1), 'cm/s'
          );
        }

        // Initialize anchor on first ZUPT
        if (!isInitialized) {
          const anchorXY: [number, number] = [newState.x[0], newState.x[1]];
          set({ isInitialized: true, anchorXY });
          console.log('[ESKF] Initialized at anchor:', anchorXY);
        }
      }

      // Apply constraints (when initialized and not during ZUPT)
      if (isInitialized && !zuptActive) {
        const velocityMag = Math.sqrt(
          newState.x[3] ** 2 + newState.x[4] ** 2 + newState.x[5] ** 2
        );

        // Apply constraint when moving (velocity > 5 cm/s)
        if (velocityMag > 0.05) {
          if (constraint.type === 'verticalPlane' && constraint.axis) {
            newState = ekfPlanarUpdate(newState, constraint.axis, ekfParams);
          } else if (constraint.type === 'lineVertical' && constraint.anchorXY) {
            newState = ekfLineVerticalUpdate(newState, constraint.anchorXY, ekfParams);
          }
        }
      }

      // Position clipping (safety bounds)
      const MAX_POS = 2.5;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(newState.x[i]) > MAX_POS) {
          newState.x[i] = Math.sign(newState.x[i]) * MAX_POS;
        }
      }

      // Update debug callback if available
      if ((window as any).__updateSensorDebug) {
        (window as any).__updateSensorDebug(imu.gyro_rads, a_enu);
      }

      // Determine init status
      let newInitStatus = get().initStatus;
      if (!isInitialized && !zuptActive) {
        newInitStatus = 'waiting';
      } else if (isInitialized) {
        newInitStatus = 'initialized';
      }

      set({
        state: createStateWithGetters(newState),
        zuptActive,
        lastTimestamp: t,
        loopHz,
        dtJitter,
        gyroMagnitude: gyroMag,
        accelMagnitude: accelMag,
        initStatus: newInitStatus
      });
      } catch (err) {
        console.error('[EKFStore] Error in processSample:', err);
      }
    }
  };
});

// Load preferences on app startup
export async function initEKFStoreFromPreferences() {
  try {
    const { loadUserPreferences } = await import('../core/services/preferencesService');
    const prefs = await loadUserPreferences();

    const store = useEKFStore.getState();

    // Load preferences without triggering save
    store.setEkfParams(prefs.ekf_params, true);
    store.setZuptParams(prefs.zupt_params, true);
    store.setConstraint(prefs.constraint_settings, true);

    console.log('[EKFStore] Loaded preferences from database:', prefs);
  } catch (err) {
    console.error('[EKFStore] Failed to load preferences:', err);
  }
}

// Export types for compatibility
export type { EkfState as EKFState, EkfParams as EKFConfig };
export { DEFAULT_EKF_PARAMS as DEFAULT_EKF_CONFIG };
