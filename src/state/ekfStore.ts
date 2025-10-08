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

interface EKFStoreState {
  // State and parameters
  state: EkfState;
  ekfParams: EkfParams;
  zuptParams: ZuptParams;
  constraint: ConstraintConfig;

  // Initialization
  isInitialized: boolean;
  anchorXY: [number, number];

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

  // Actions
  reset: () => void;
  setEkfParams: (params: Partial<EkfParams>) => void;
  setZuptParams: (params: Partial<ZuptParams>) => void;
  setConstraint: (constraint: ConstraintConfig) => void;
  setConfig: (config: Partial<EkfParams>) => void; // Alias for compatibility
  getRelativePosition: () => [number, number, number];
  processSample: (sample: {
    accel_g: [number, number, number];
    gyro_dps: [number, number, number];
    euler_deg: [number, number, number];
    timestamp_ms: number;
  }) => void;
}

export const useEKFStore = create<EKFStoreState>((set, get) => {
  // Initialize mechanization with default cutoff
  initMechanization(3.5);

  const zuptDetector = new ZuptDetector(DEFAULT_ZUPT_PARAMS);

  return {
    // State and parameters
    state: ekfInit(),
    ekfParams: DEFAULT_EKF_PARAMS,
    zuptParams: DEFAULT_ZUPT_PARAMS,
    constraint: { type: 'verticalPlane', axis: 'y' },

    // Initialization
    isInitialized: false,
    anchorXY: [0, 0],

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

    reset: () => {
      resetMechanization();
      useStreamStore.getState().clearBuffer();
      get().zuptDetector.reset();

      set({
        state: ekfInit(),
        isInitialized: false,
        anchorXY: [0, 0],
        zuptActive: false,
        lastTimestamp: null,
        loopHz: 0,
        dtJitter: 0,
        gyroMagnitude: 0,
        accelMagnitude: 0
      });
    },

    setEkfParams: (params) => {
      set({ ekfParams: { ...get().ekfParams, ...params } });
    },

    setZuptParams: (params) => {
      const newParams = { ...get().zuptParams, ...params };
      get().zuptDetector.setParams(newParams);
      set({ zuptParams: newParams });
    },

    setConstraint: (constraint) => {
      set({ constraint });
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
        console.error('[ESKF] Invalid sample:', sample);
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

      // Performance metrics
      const loopHz = 1 / dt;
      const dtJitter = Math.abs(dt - 0.05); // Expected 50ms

      // EKF Prediction
      let newState = ekfPredict(state, dt, a_enu, ekfParams);

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

        const vAfter = Math.sqrt(
          newState.x[3] ** 2 + newState.x[4] ** 2 + newState.x[5] ** 2
        );

        if ((Date.now() % 1000) < 100) { // Log occasionally
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

      set({
        state: newState,
        zuptActive,
        lastTimestamp: t,
        loopHz,
        dtJitter,
        gyroMagnitude: gyroMag,
        accelMagnitude: accelMag
      });
    }
  };
});

// Export types for compatibility
export type { EkfState as EKFState, EkfParams as EKFConfig };
export { DEFAULT_EKF_PARAMS as DEFAULT_EKF_CONFIG };
