/**
 * Tests for ZUPT Detection
 *
 * References:
 * - Wahlström & Skog (2020): detector families and thresholds
 * - Skog et al. (2010): SHOE detector evaluation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ZuptDetector,
  detectZUPT,
  DEFAULT_ZUPT_PARAMS,
  type ZuptSample
} from '../core/math/zupt';

describe('ZUPT Detection', () => {
  let detector: ZuptDetector;

  beforeEach(() => {
    detector = new ZuptDetector(DEFAULT_ZUPT_PARAMS);
  });

  describe('ZuptDetector', () => {
    it('should detect stationary period after minHoldMs', () => {
      const samples: ZuptSample[] = [];

      // Create 250 ms of stationary data at 20 Hz (5 samples)
      for (let i = 0; i < 5; i++) {
        const sample: ZuptSample = {
          a_enu: [0.01, 0.01, 0.01], // Below threshold (0.06)
          gyro: [0.01, 0.01, 0.01], // Below threshold (0.06)
          timestamp_ms: i * 50
        };
        samples.push(sample);
      }

      let result = false;
      for (const sample of samples) {
        const buffer = samples.slice(Math.max(0, samples.indexOf(sample) - 3));
        result = detector.detect(sample, buffer);
      }

      // After 250 ms (5 samples), should detect ZUPT
      expect(result).toBe(true);
      expect(detector.isZupt()).toBe(true);
    });

    it('should NOT detect ZUPT during motion', () => {
      const samples: ZuptSample[] = [];

      // Create 250 ms of motion data
      for (let i = 0; i < 5; i++) {
        const sample: ZuptSample = {
          a_enu: [0.5, 0.2, 0.3], // Above threshold
          gyro: [0.2, 0.1, 0.15], // Above threshold
          timestamp_ms: i * 50
        };
        samples.push(sample);
      }

      let result = false;
      for (const sample of samples) {
        const buffer = samples.slice(Math.max(0, samples.indexOf(sample) - 3));
        result = detector.detect(sample, buffer);
      }

      expect(result).toBe(false);
      expect(detector.isZupt()).toBe(false);
    });

    it('should reset stationary state when motion detected', () => {
      const samples: ZuptSample[] = [];

      // First, become stationary
      for (let i = 0; i < 5; i++) {
        const sample: ZuptSample = {
          a_enu: [0.01, 0.01, 0.01],
          gyro: [0.01, 0.01, 0.01],
          timestamp_ms: i * 50
        };
        samples.push(sample);
        const buffer = samples.slice(Math.max(0, i - 3));
        detector.detect(sample, buffer);
      }

      expect(detector.isZupt()).toBe(true);

      // Then, introduce motion
      const motionSample: ZuptSample = {
        a_enu: [1.0, 0.5, 0.3],
        gyro: [0.5, 0.3, 0.2],
        timestamp_ms: 250
      };

      const result = detector.detect(motionSample, [motionSample]);

      expect(result).toBe(false);
      expect(detector.isZupt()).toBe(false);
    });

    it('should implement hysteresis to prevent flapping', () => {
      const samples: ZuptSample[] = [];

      // Become stationary
      for (let i = 0; i < 5; i++) {
        const sample: ZuptSample = {
          a_enu: [0.01, 0.01, 0.01],
          gyro: [0.01, 0.01, 0.01],
          timestamp_ms: i * 50
        };
        samples.push(sample);
        const buffer = samples.slice(Math.max(0, i - 3));
        detector.detect(sample, buffer);
      }

      expect(detector.isZupt()).toBe(true);

      // Brief disturbance (single sample slightly above threshold)
      const disturbance: ZuptSample = {
        a_enu: [0.07, 0.02, 0.02], // Slightly above 0.06
        gyro: [0.02, 0.02, 0.02],
        timestamp_ms: 250
      };

      const result = detector.detect(disturbance, [disturbance]);

      // Due to hysteresis, should still be active briefly
      expect(result).toBe(true);
    });

    it('should allow parameter updates', () => {
      detector.setParams({ a_thr: 0.1, w_thr: 0.1 });

      const params = detector.getParams();
      expect(params.a_thr).toBe(0.1);
      expect(params.w_thr).toBe(0.1);
    });

    it('should reset state correctly', () => {
      // Become stationary
      for (let i = 0; i < 5; i++) {
        const sample: ZuptSample = {
          a_enu: [0.01, 0.01, 0.01],
          gyro: [0.01, 0.01, 0.01],
          timestamp_ms: i * 50
        };
        detector.detect(sample, [sample]);
      }

      expect(detector.isZupt()).toBe(true);

      detector.reset();

      expect(detector.isZupt()).toBe(false);
    });
  });

  describe('detectZUPT (standalone)', () => {
    it('should detect stationary window', () => {
      const buffer: ZuptSample[] = [];

      // 250 ms of stationary data
      for (let i = 0; i < 5; i++) {
        buffer.push({
          a_enu: [0.02, 0.01, 0.03],
          gyro: [0.01, 0.02, 0.01],
          timestamp_ms: i * 50
        });
      }

      const result = detectZUPT(buffer, DEFAULT_ZUPT_PARAMS);
      expect(result).toBe(true);
    });

    it('should reject motion window', () => {
      const buffer: ZuptSample[] = [];

      // 250 ms with motion
      for (let i = 0; i < 5; i++) {
        buffer.push({
          a_enu: [0.5, 0.3, 0.2],
          gyro: [0.3, 0.2, 0.1],
          timestamp_ms: i * 50
        });
      }

      const result = detectZUPT(buffer, DEFAULT_ZUPT_PARAMS);
      expect(result).toBe(false);
    });

    it('should reject window that is too short', () => {
      const buffer: ZuptSample[] = [
        {
          a_enu: [0.01, 0.01, 0.01],
          gyro: [0.01, 0.01, 0.01],
          timestamp_ms: 0
        }
      ];

      // Only 1 sample, need at least 4 for 200ms at 20 Hz
      const result = detectZUPT(buffer, DEFAULT_ZUPT_PARAMS);
      expect(result).toBe(false);
    });

    it('should handle empty buffer', () => {
      const result = detectZUPT([], DEFAULT_ZUPT_PARAMS);
      expect(result).toBe(false);
    });
  });
});
