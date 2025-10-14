/**
 * Zero Velocity Update (ZUPT) Detection
 *
 * References:
 * - Wahlström & Skog (2020): "Fifteen Years of Progress at Zero Velocity"
 *   https://arxiv.org/abs/2011.09554
 *   (ZUPT history, detector families, sampling rate considerations)
 *
 * - Skog et al. (2010): "Zero-Velocity Detection—An Algorithm Evaluation"
 *   https://pubmed.ncbi.nlm.nih.gov/20729991/
 *   (GLRT, SHOE, ARED detector formulations and evaluation)
 *
 * - OpenShoe: Practical ZUPT implementation patterns
 *   http://www.openshoe.org/
 *
 * This module implements a SHOE-style (magnitude threshold) ZUPT detector
 * optimized for 20 Hz IMU sampling. The detector uses:
 * - Sliding window of 200-300 ms
 * - Magnitude thresholds for gyro and accelerometer
 * - Hysteresis to prevent flapping
 *
 * Key insight from literature: Lower sampling rates require longer windows
 * and more conservative thresholds to maintain detection reliability.
 * For 20 Hz, a 4-6 sample window (200-300 ms) provides good balance.
 */

export interface ZuptParams {
  a_thr: number;      // Acceleration threshold [m/s²] - deviation from gravity
  w_thr: number;      // Gyroscope threshold [rad/s] - angular velocity magnitude
  minHoldMs: number;  // Minimum duration for stationary detection [ms]
}

/**
 * Default ZUPT parameters tuned for 20 Hz sampling
 *
 * These values are based on:
 * - Typical sensor noise levels for consumer MEMS IMUs
 * - OpenShoe recommended starting points
 * - Empirical tuning for barbell movement dynamics
 *
 * NOTE: Consumer-grade IMUs have higher noise than industrial sensors:
 * - Accel noise: ~0.15-0.5 m/s² typical
 * - Gyro noise: ~0.1-0.3 rad/s typical
 */
export const DEFAULT_ZUPT_PARAMS: ZuptParams = {
  a_thr: 0.5,       // 500 mm/s² - realistic for consumer IMU
  w_thr: 0.4,       // 400 mrad/s - about 23 deg/s
  minHoldMs: 200    // 4 samples at 20 Hz
};

/**
 * Sample in detection buffer
 */
export interface ZuptSample {
  a_enu: [number, number, number];   // ENU acceleration (gravity removed) [m/s²]
  gyro: [number, number, number];    // Body gyroscope [rad/s]
  timestamp_ms: number;              // Sample timestamp
}

/**
 * ZUPT detector state with hysteresis
 */
export class ZuptDetector {
  private isStationary: boolean = false;
  private stationaryStartTime: number | null = null;
  private readonly HYSTERESIS_MS = 100; // Prevent flapping

  constructor(private params: ZuptParams = DEFAULT_ZUPT_PARAMS) {}

  /**
   * Update ZUPT detector with new sample
   *
   * Uses SHOE-style magnitude thresholding:
   * - Stationary if BOTH gyro and accel norms below thresholds
   * - Must persist for at least minHoldMs
   * - Hysteresis prevents rapid on/off transitions
   *
   * @param sample Current IMU sample
   * @param buffer Recent samples for window-based decision
   * @returns true if zero velocity should be applied
   */
  detect(sample: ZuptSample, buffer: ZuptSample[]): boolean {
    const now = sample.timestamp_ms;

    // Compute magnitudes
    const gyro_mag = Math.sqrt(
      sample.gyro[0] ** 2 +
      sample.gyro[1] ** 2 +
      sample.gyro[2] ** 2
    );

    const accel_mag = Math.sqrt(
      sample.a_enu[0] ** 2 +
      sample.a_enu[1] ** 2 +
      sample.a_enu[2] ** 2
    );

    // Check if current sample is below thresholds
    const currentlyQuiet = gyro_mag < this.params.w_thr &&
                          accel_mag < this.params.a_thr;

    if (!currentlyQuiet) {
      // Motion detected, reset stationary state
      this.isStationary = false;
      this.stationaryStartTime = null;
      return false;
    }

    // Check window: all recent samples must be below thresholds
    const windowQuiet = buffer.every(s => {
      const g_mag = Math.sqrt(s.gyro[0] ** 2 + s.gyro[1] ** 2 + s.gyro[2] ** 2);
      const a_mag = Math.sqrt(s.a_enu[0] ** 2 + s.a_enu[1] ** 2 + s.a_enu[2] ** 2);
      return g_mag < this.params.w_thr && a_mag < this.params.a_thr;
    });

    if (!windowQuiet) {
      // Window not entirely quiet
      if (this.isStationary) {
        // Apply hysteresis: stay stationary for a bit longer
        const timeSinceStart = now - (this.stationaryStartTime || now);
        if (timeSinceStart < this.HYSTERESIS_MS) {
          return true; // Keep ZUPT active during hysteresis
        }
      }
      this.isStationary = false;
      this.stationaryStartTime = null;
      return false;
    }

    // Window is quiet, check duration
    if (this.stationaryStartTime === null) {
      this.stationaryStartTime = now;
    }

    const stationaryDuration = now - this.stationaryStartTime;

    if (stationaryDuration >= this.params.minHoldMs) {
      this.isStationary = true;
      return true;
    }

    return false;
  }

  /**
   * Check if currently in stationary state
   */
  isZupt(): boolean {
    return this.isStationary;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.isStationary = false;
    this.stationaryStartTime = null;
  }

  /**
   * Update detection parameters
   */
  setParams(params: Partial<ZuptParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Get current parameters
   */
  getParams(): ZuptParams {
    return { ...this.params };
  }
}

/**
 * Standalone detection function for testing
 *
 * Evaluates if a buffer of samples represents a stationary period
 * using SHOE-style magnitude thresholding.
 *
 * Uses actual timestamps to measure window duration instead of
 * assuming fixed sample rate.
 *
 * @param buffer Array of recent IMU samples with timestamps
 * @param params Detection parameters
 * @returns true if all samples in buffer are below thresholds
 */
export function detectZUPT(
  buffer: { a_enu: [number, number, number]; gyro: [number, number, number]; timestamp_ms?: number }[],
  params: ZuptParams
): boolean {
  if (buffer.length < 2) return false;

  // Check duration using timestamps if available
  if (buffer[0].timestamp_ms !== undefined && buffer[buffer.length - 1].timestamp_ms !== undefined) {
    const duration = buffer[buffer.length - 1].timestamp_ms! - buffer[0].timestamp_ms!;
    if (duration < params.minHoldMs) return false;
  }

  // All samples must be below thresholds
  return buffer.every(s => {
    const gyro_mag = Math.sqrt(s.gyro[0] ** 2 + s.gyro[1] ** 2 + s.gyro[2] ** 2);
    const accel_mag = Math.sqrt(s.a_enu[0] ** 2 + s.a_enu[1] ** 2 + s.a_enu[2] ** 2);

    return gyro_mag < params.w_thr && accel_mag < params.a_thr;
  });
}

/**
 * Compute windowed variance for GLRT-style detection (advanced)
 *
 * This implements the Generalized Likelihood Ratio Test approach
 * mentioned in Skog et al. (2010). For most applications, the
 * simpler SHOE detector above is sufficient.
 *
 * @param buffer Recent samples
 * @returns variance of acceleration magnitudes in window
 */
export function computeWindowVariance(
  buffer: { a_enu: [number, number, number] }[]
): number {
  if (buffer.length < 2) return Infinity;

  const magnitudes = buffer.map(s =>
    Math.sqrt(s.a_enu[0] ** 2 + s.a_enu[1] ** 2 + s.a_enu[2] ** 2)
  );

  const mean = magnitudes.reduce((sum, m) => sum + m, 0) / magnitudes.length;
  const variance = magnitudes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / magnitudes.length;

  return variance;
}
