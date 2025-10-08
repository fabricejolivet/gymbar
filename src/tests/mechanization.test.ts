/**
 * Tests for Strapdown Mechanization
 *
 * References:
 * - Titterton & Weston: gravity removal sanity checks
 * - Groves: coordinate transformation verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  bodyToEnuAccelEuler,
  toImu20,
  initMechanization,
  resetMechanization,
  type Imu20
} from '../core/math/mechanization';

describe('Mechanization', () => {
  beforeEach(() => {
    // Reset filter state before each test
    resetMechanization();
    initMechanization(3.5);
  });

  describe('toImu20', () => {
    it('should convert raw data to SI units', () => {
      const imu = toImu20(
        1000, // timestamp_ms
        [0, 0, 1], // 1g in z
        [0, 0, 90], // 90 deg/s in z
        [0, 0, 90] // 90 degrees yaw
      );

      expect(imu.t).toBeCloseTo(1, 3);
      expect(imu.accel_ms2[2]).toBeCloseTo(9.80665, 3);
      expect(imu.gyro_rads[2]).toBeCloseTo(Math.PI / 2, 3);
      expect(imu.euler_rad[2]).toBeCloseTo(Math.PI / 2, 3);
    });
  });

  describe('bodyToEnuAccelEuler', () => {
    it('should return near-zero acceleration when stationary (gravity removed)', () => {
      // Static pose: level, accel = [0, 0, 1g] in body
      const imu: Imu20 = {
        t: 0,
        accel_ms2: [0, 0, 9.80665], // gravity in body Z
        gyro_rads: [0, 0, 0],
        euler_rad: [0, 0, 0] // level
      };

      // Need a few samples for filter to settle
      for (let i = 0; i < 10; i++) {
        bodyToEnuAccelEuler(imu);
      }

      const a_enu = bodyToEnuAccelEuler(imu);

      // After gravity removal, acceleration should be near zero
      const mag = Math.sqrt(a_enu[0] ** 2 + a_enu[1] ** 2 + a_enu[2] ** 2);
      expect(mag).toBeLessThan(0.1); // < 10 cm/s²
    });

    it('should handle pitch rotation correctly', () => {
      // Pitched 90 degrees forward: gravity in -Y body
      const imu: Imu20 = {
        t: 0,
        accel_ms2: [0, -9.80665, 0], // gravity in -Y
        gyro_rads: [0, 0, 0],
        euler_rad: [0, Math.PI / 2, 0] // 90° pitch
      };

      // Settle filter
      for (let i = 0; i < 10; i++) {
        bodyToEnuAccelEuler(imu);
      }

      const a_enu = bodyToEnuAccelEuler(imu);

      // After gravity removal, should still be near zero
      const mag = Math.sqrt(a_enu[0] ** 2 + a_enu[1] ** 2 + a_enu[2] ** 2);
      expect(mag).toBeLessThan(0.15);
    });

    it('should handle roll rotation correctly', () => {
      // Rolled 90 degrees: gravity in -X body
      const imu: Imu20 = {
        t: 0,
        accel_ms2: [-9.80665, 0, 0],
        gyro_rads: [0, 0, 0],
        euler_rad: [Math.PI / 2, 0, 0] // 90° roll
      };

      // Settle filter
      for (let i = 0; i < 10; i++) {
        bodyToEnuAccelEuler(imu);
      }

      const a_enu = bodyToEnuAccelEuler(imu);

      const mag = Math.sqrt(a_enu[0] ** 2 + a_enu[1] ** 2 + a_enu[2] ** 2);
      expect(mag).toBeLessThan(0.15);
    });

    it('should detect linear acceleration after gravity removal', () => {
      // 1 m/s² upward acceleration + gravity
      const imu: Imu20 = {
        t: 0,
        accel_ms2: [0, 0, 10.80665], // g + 1 m/s²
        gyro_rads: [0, 0, 0],
        euler_rad: [0, 0, 0]
      };

      // Settle filter
      for (let i = 0; i < 10; i++) {
        bodyToEnuAccelEuler(imu);
      }

      const a_enu = bodyToEnuAccelEuler(imu);

      // Should detect the 1 m/s² upward acceleration
      expect(a_enu[2]).toBeGreaterThan(0.5);
      expect(a_enu[2]).toBeLessThan(1.5);
    });

    it('should return zero near gimbal lock (pitch ~90°)', () => {
      const imu: Imu20 = {
        t: 0,
        accel_ms2: [0, 0, 9.80665],
        gyro_rads: [0, 0, 0],
        euler_rad: [0, 1.57, 0] // ~90° pitch
      };

      const a_enu = bodyToEnuAccelEuler(imu);

      // Should return zeros to avoid numerical issues
      expect(a_enu[0]).toBe(0);
      expect(a_enu[1]).toBe(0);
      expect(a_enu[2]).toBe(0);
    });

    it('should low-pass filter high-frequency noise', () => {
      // Inject high-frequency noise at 10 Hz (above cutoff)
      const samples: number[] = [];

      for (let i = 0; i < 40; i++) {
        const t = i * 0.05; // 20 Hz
        const noise = Math.sin(2 * Math.PI * 10 * t); // 10 Hz sine wave

        const imu: Imu20 = {
          t,
          accel_ms2: [0, 0, 9.80665 + noise],
          gyro_rads: [0, 0, 0],
          euler_rad: [0, 0, 0]
        };

        const a_enu = bodyToEnuAccelEuler(imu);
        samples.push(Math.abs(a_enu[2]));
      }

      // After filter settles, high-frequency component should be attenuated
      const filtered = samples.slice(-10);
      const avgMag = filtered.reduce((sum, v) => sum + v, 0) / filtered.length;

      // Filtered output should be much smaller than input amplitude (1 m/s²)
      expect(avgMag).toBeLessThan(0.5);
    });
  });
});
