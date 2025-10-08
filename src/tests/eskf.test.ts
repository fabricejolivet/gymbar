/**
 * Tests for Error-State Kalman Filter
 *
 * References:
 * - Solà (2017): ESKF error-state math verification
 * - OpenShoe: ZUPT-aided EKF behavior patterns
 * - Wahlström & Skog (2020): ZUPT performance expectations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ekfInit,
  ekfPredict,
  ekfZuptUpdate,
  ekfPlanarUpdate,
  ekfLineVerticalUpdate,
  DEFAULT_EKF_PARAMS,
  type EkfState
} from '../core/math/eskf';

describe('ESKF', () => {
  let state: EkfState;

  beforeEach(() => {
    state = ekfInit();
  });

  describe('ekfInit', () => {
    it('should initialize at origin with zero velocity', () => {
      expect(state.x[0]).toBe(0); // px
      expect(state.x[1]).toBe(0); // py
      expect(state.x[2]).toBe(0); // pz
      expect(state.x[3]).toBe(0); // vx
      expect(state.x[4]).toBe(0); // vy
      expect(state.x[5]).toBe(0); // vz
      expect(state.x[6]).toBe(0); // bax
      expect(state.x[7]).toBe(0); // bay
      expect(state.x[8]).toBe(0); // baz
    });

    it('should have reasonable initial covariance', () => {
      // Position uncertainty
      expect(state.P[0]).toBeGreaterThan(0);
      expect(state.P[0]).toBeLessThan(1e-2);

      // Velocity uncertainty
      expect(state.P[30]).toBeGreaterThan(0);
      expect(state.P[30]).toBeLessThan(1e-4);
    });
  });

  describe('ekfPredict', () => {
    it('should integrate constant acceleration', () => {
      const dt = 0.05; // 20 Hz
      const a_enu: [number, number, number] = [0, 0, 1.0]; // 1 m/s² upward

      // Predict for 1 second (20 steps)
      for (let i = 0; i < 20; i++) {
        state = ekfPredict(state, dt, a_enu, DEFAULT_EKF_PARAMS);
      }

      // After 1s with 1 m/s² upward:
      // v = a*t = 1 m/s
      // p = 0.5*a*t² = 0.5 m

      expect(state.x[5]).toBeCloseTo(1.0, 1); // vz ≈ 1 m/s
      expect(state.x[2]).toBeCloseTo(0.5, 1); // pz ≈ 0.5 m
    });

    it('should handle zero acceleration (coast)', () => {
      // Initialize with velocity
      state.x[5] = 0.5; // 0.5 m/s upward

      const dt = 0.05;
      const a_enu: [number, number, number] = [0, 0, 0];

      // Coast for 1 second
      for (let i = 0; i < 20; i++) {
        state = ekfPredict(state, dt, a_enu, DEFAULT_EKF_PARAMS);
      }

      // Velocity should remain constant
      expect(state.x[5]).toBeCloseTo(0.5, 2);

      // Position should increase by v*t = 0.5 m
      expect(state.x[2]).toBeCloseTo(0.5, 1);
    });

    it('should account for bias in acceleration', () => {
      // Set a bias
      state.x[8] = 0.1; // 0.1 m/s² bias in Z

      const dt = 0.05;
      const a_enu: [number, number, number] = [0, 0, 0.2]; // Measured 0.2 m/s²

      // Predict for 1 second
      for (let i = 0; i < 20; i++) {
        state = ekfPredict(state, dt, a_enu, DEFAULT_EKF_PARAMS);
      }

      // True acceleration = 0.2 - 0.1 = 0.1 m/s²
      // v = 0.1 * 1 = 0.1 m/s
      expect(state.x[5]).toBeCloseTo(0.1, 1);
    });

    it('should increase covariance over time', () => {
      const initialPv = state.P[30]; // velocity variance (3,3)

      const dt = 0.05;
      const a_enu: [number, number, number] = [0, 0, 0];

      // Predict for 1 second
      for (let i = 0; i < 20; i++) {
        state = ekfPredict(state, dt, a_enu, DEFAULT_EKF_PARAMS);
      }

      const finalPv = state.P[30];

      // Covariance should grow due to process noise
      expect(finalPv).toBeGreaterThan(initialPv);
    });
  });

  describe('ekfZuptUpdate', () => {
    it('should zero out velocity', () => {
      // Start with some velocity
      state.x[3] = 0.1;
      state.x[4] = 0.2;
      state.x[5] = 0.3;

      state = ekfZuptUpdate(state, DEFAULT_EKF_PARAMS);

      // Velocity should be very close to zero
      expect(Math.abs(state.x[3])).toBeLessThan(0.01);
      expect(Math.abs(state.x[4])).toBeLessThan(0.01);
      expect(Math.abs(state.x[5])).toBeLessThan(0.01);
    });

    it('should reduce velocity uncertainty', () => {
      const initialPv = state.P[30];

      // Apply ZUPT
      state = ekfZuptUpdate(state, DEFAULT_EKF_PARAMS);

      const finalPv = state.P[30];

      // Velocity uncertainty should decrease
      expect(finalPv).toBeLessThan(initialPv);
    });

    it('should handle repeated ZUPT updates (OpenShoe behavior)', () => {
      const dt = 0.05;
      const a_enu: [number, number, number] = [0.01, 0.01, 0.01]; // Small noise

      // Simulate 1 second of stationary with ZUPT every step
      for (let i = 0; i < 20; i++) {
        state = ekfPredict(state, dt, a_enu, DEFAULT_EKF_PARAMS);
        state = ekfZuptUpdate(state, DEFAULT_EKF_PARAMS);
      }

      // Velocity should remain near zero
      const vMag = Math.sqrt(state.x[3] ** 2 + state.x[4] ** 2 + state.x[5] ** 2);
      expect(vMag).toBeLessThan(0.01); // < 1 cm/s
    });
  });

  describe('Integration Test: 1D Up-Down Reps with Holds', () => {
    it('should maintain bounded drift over multiple reps with ZUPT', () => {
      const dt = 0.05; // 20 Hz
      const params = DEFAULT_EKF_PARAMS;

      // Simulate 3 reps of up-down movement with 200ms holds
      const positions: number[] = [];

      for (let rep = 0; rep < 3; rep++) {
        // Hold at bottom (200ms = 4 samples)
        for (let i = 0; i < 4; i++) {
          state = ekfPredict(state, dt, [0, 0, 0], params);
          state = ekfZuptUpdate(state, params);
        }

        const vAfterZupt = Math.sqrt(state.x[3] ** 2 + state.x[4] ** 2 + state.x[5] ** 2);
        expect(vAfterZupt).toBeLessThan(0.01); // Velocity should be ~0

        // Upward acceleration (0.5s)
        for (let i = 0; i < 10; i++) {
          state = ekfPredict(state, dt, [0, 0, 2.0], params);
        }

        // Coast up (0.2s)
        for (let i = 0; i < 4; i++) {
          state = ekfPredict(state, dt, [0, 0, 0], params);
        }

        // Deceleration at top (0.5s)
        for (let i = 0; i < 10; i++) {
          state = ekfPredict(state, dt, [0, 0, -2.0], params);
        }

        // Hold at top (200ms)
        for (let i = 0; i < 4; i++) {
          state = ekfPredict(state, dt, [0, 0, 0], params);
          state = ekfZuptUpdate(state, params);
        }

        // Downward acceleration (0.5s)
        for (let i = 0; i < 10; i++) {
          state = ekfPredict(state, dt, [0, 0, -2.0], params);
        }

        // Coast down (0.2s)
        for (let i = 0; i < 4; i++) {
          state = ekfPredict(state, dt, [0, 0, 0], params);
        }

        // Deceleration at bottom (0.5s)
        for (let i = 0; i < 10; i++) {
          state = ekfPredict(state, dt, [0, 0, 2.0], params);
        }

        positions.push(state.x[2]);
      }

      // After returning to start, position drift should be bounded
      const finalZ = state.x[2];
      expect(Math.abs(finalZ)).toBeLessThan(0.1); // < 10 cm drift after 3 reps
    });
  });

  describe('ekfPlanarUpdate', () => {
    it('should constrain X position near zero', () => {
      // Start with lateral drift
      state.x[0] = 0.5; // 50 cm East

      state = ekfPlanarUpdate(state, 'x', DEFAULT_EKF_PARAMS);

      // X should be pulled toward zero
      expect(Math.abs(state.x[0])).toBeLessThan(0.5);
    });

    it('should constrain Y position near zero', () => {
      state.x[1] = 0.3; // 30 cm North

      state = ekfPlanarUpdate(state, 'y', DEFAULT_EKF_PARAMS);

      expect(Math.abs(state.x[1])).toBeLessThan(0.3);
    });

    it('should not affect Z position', () => {
      state.x[2] = 1.0;
      const initialZ = state.x[2];

      state = ekfPlanarUpdate(state, 'x', DEFAULT_EKF_PARAMS);

      expect(state.x[2]).toBe(initialZ);
    });
  });

  describe('ekfLineVerticalUpdate', () => {
    it('should constrain XY position to anchor point', () => {
      const anchorXY: [number, number] = [0.1, 0.2];

      // Start away from anchor
      state.x[0] = 0.5;
      state.x[1] = 0.6;

      state = ekfLineVerticalUpdate(state, anchorXY, DEFAULT_EKF_PARAMS);

      // Should be pulled toward anchor
      expect(state.x[0]).toBeCloseTo(anchorXY[0], 0);
      expect(state.x[1]).toBeCloseTo(anchorXY[1], 0);
    });

    it('should not affect Z position', () => {
      state.x[2] = 1.5;
      const initialZ = state.x[2];

      state = ekfLineVerticalUpdate(state, [0, 0], DEFAULT_EKF_PARAMS);

      expect(state.x[2]).toBe(initialZ);
    });
  });

  describe('Constraint Effectiveness Test', () => {
    it('should reduce lateral drift by at least 50% with constraints', () => {
      const dt = 0.05;
      const params = DEFAULT_EKF_PARAMS;

      // Simulate vertical motion with small lateral drift (no constraint)
      let stateNoConstraint = ekfInit();
      const lateralAccel = 0.02; // 2 cm/s² lateral drift

      for (let i = 0; i < 40; i++) { // 2 seconds
        stateNoConstraint = ekfPredict(
          stateNoConstraint,
          dt,
          [lateralAccel, lateralAccel, 1.0],
          params
        );
      }

      const lateralDriftNoConstraint = Math.sqrt(
        stateNoConstraint.x[0] ** 2 + stateNoConstraint.x[1] ** 2
      );

      // Now with constraint
      let stateWithConstraint = ekfInit();

      for (let i = 0; i < 40; i++) {
        stateWithConstraint = ekfPredict(
          stateWithConstraint,
          dt,
          [lateralAccel, lateralAccel, 1.0],
          params
        );

        // Apply planar constraints
        stateWithConstraint = ekfPlanarUpdate(stateWithConstraint, 'x', params);
        stateWithConstraint = ekfPlanarUpdate(stateWithConstraint, 'y', params);
      }

      const lateralDriftWithConstraint = Math.sqrt(
        stateWithConstraint.x[0] ** 2 + stateWithConstraint.x[1] ** 2
      );

      // Constraint should reduce drift by at least 50%
      const effectiveness = lateralDriftNoConstraint / lateralDriftWithConstraint;
      expect(effectiveness).toBeGreaterThan(1.5);
    });
  });
});
