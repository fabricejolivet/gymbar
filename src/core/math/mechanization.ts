/**
 * Strapdown Mechanization for Inertial Navigation
 *
 * References:
 * - Titterton & Weston: "Strapdown Inertial Navigation Technology" (reference frames, gravity removal)
 * - Groves: "Principles of GNSS, Inertial, and Multisensor Integrated Navigation Systems" (coordinate transforms)
 *
 * This module converts body-frame IMU measurements to ENU (East-North-Up) frame
 * using Euler angles from the WT9011 sensor, removes gravity, and applies low-pass
 * filtering appropriate for 20 Hz sampling rate to prevent aliasing.
 *
 * Frame conventions:
 * - Body frame: X-forward, Y-left, Z-up (sensor mounting)
 * - ENU frame: X-East, Y-North, Z-Up (local level)
 * - Euler angles: Z-Y-X convention (Yaw-Pitch-Roll)
 */

/**
 * Leveling offsets for roll and pitch
 * Set during first long ZUPT to remove steady gravity leak from imperfect leveling
 */
let rollOffset = 0;
let pitchOffset = 0;

export function setLevelOffsets(roll_rad: number, pitch_rad: number): void {
  rollOffset = roll_rad;
  pitchOffset = pitch_rad;
}

export function getLevelOffsets(): [number, number] {
  return [rollOffset, pitchOffset];
}

export function resetLevelOffsets(): void {
  rollOffset = 0;
  pitchOffset = 0;
}

export type Imu20 = {
  t: number;  // timestamp in milliseconds
  accel_ms2: [number, number, number];  // body frame, includes gravity
  gyro_rads: [number, number, number];  // body frame
  euler_rad: [number, number, number];  // [roll, pitch, yaw] in Z-Y-X convention
};

/**
 * 2nd-order Butterworth low-pass filter state
 */
interface ButterworthState {
  x1: [number, number, number];
  x2: [number, number, number];
  y1: [number, number, number];
  y2: [number, number, number];
}

/**
 * Low-pass filter for acceleration data
 * 2nd-order Butterworth with cutoff appropriate for 20 Hz sampling
 */
class LowPassFilter {
  private state: ButterworthState;
  private a0: number;
  private a1: number;
  private a2: number;
  private b1: number;
  private b2: number;

  constructor(cutoffHz: number, sampleHz: number) {
    // Butterworth coefficients for 2nd order low-pass
    const wc = 2 * Math.PI * cutoffHz;
    const T = 1 / sampleHz;
    const wc2 = wc * wc;
    const wc_sqrt2 = wc * Math.SQRT2;

    const k = wc2 * T * T;
    const k1 = wc_sqrt2 * T;
    const denom = 4 + 2 * k1 + k;

    this.a0 = k / denom;
    this.a1 = 2 * k / denom;
    this.a2 = k / denom;
    this.b1 = (2 * k - 8) / denom;
    this.b2 = (4 - 2 * k1 + k) / denom;

    this.state = {
      x1: [0, 0, 0],
      x2: [0, 0, 0],
      y1: [0, 0, 0],
      y2: [0, 0, 0]
    };
  }

  filter(input: [number, number, number]): [number, number, number] {
    const output: [number, number, number] = [0, 0, 0];

    for (let i = 0; i < 3; i++) {
      output[i] = this.a0 * input[i] +
                  this.a1 * this.state.x1[i] +
                  this.a2 * this.state.x2[i] -
                  this.b1 * this.state.y1[i] -
                  this.b2 * this.state.y2[i];

      this.state.x2[i] = this.state.x1[i];
      this.state.x1[i] = input[i];
      this.state.y2[i] = this.state.y1[i];
      this.state.y1[i] = output[i];
    }

    return output;
  }

  reset(): void {
    this.state = {
      x1: [0, 0, 0],
      x2: [0, 0, 0],
      y1: [0, 0, 0],
      y2: [0, 0, 0]
    };
  }
}

let accelFilter: LowPassFilter | null = null;

/**
 * Initialize the low-pass filter with specified cutoff frequency
 */
export function initMechanization(cutoffHz: number = 3.5): void {
  accelFilter = new LowPassFilter(cutoffHz, 20);
}

/**
 * Build rotation matrix from body to ENU using Z-Y-X Euler angles
 *
 * @param euler_rad [roll, pitch, yaw] in radians
 * @returns 3x3 rotation matrix R_ENU_body
 */
function eulerToRotationMatrix(euler_rad: [number, number, number]): number[][] {
  // Apply leveling offsets (yaw unchanged)
  const roll = euler_rad[0] - rollOffset;
  const pitch = euler_rad[1] - pitchOffset;
  const yaw = euler_rad[2];

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Z-Y-X rotation: R = Rz(yaw) * Ry(pitch) * Rx(roll)
  return [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
    [-sp,     cp * sr,                cp * cr]
  ];
}

/**
 * Rotate 3D vector by rotation matrix
 */
function rotateVector(R: number[][], v: [number, number, number]): [number, number, number] {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]
  ];
}

/**
 * Convert body-frame acceleration to ENU frame, remove gravity, and apply low-pass filter
 *
 * Process:
 * 1. Rotate body acceleration to ENU frame using Euler angles
 * 2. Remove gravity vector [0, 0, -g] in ENU
 * 3. Apply 2nd-order Butterworth low-pass filter (cutoff ~3.5 Hz for 20 Hz sample rate)
 *
 * The low-pass filter prevents aliasing and removes high-frequency noise while preserving
 * the motion dynamics typical of barbell movements (~0.5-2 Hz fundamental).
 *
 * @param s IMU sample with body accel (includes gravity), gyro, and Euler angles
 * @returns ENU acceleration [m/s²] with gravity removed and filtered
 */
export function bodyToEnuAccelEuler(s: Imu20): [number, number, number] {
  if (!accelFilter) {
    initMechanization();
  }

  // Check for gimbal lock condition (pitch near ±90°)
  const pitch = s.euler_rad[1];
  if (Math.abs(pitch) > 1.48) { // ~85 degrees
    // Near gimbal lock, return zero acceleration to avoid numerical issues
    return [0, 0, 0];
  }

  // Build rotation matrix from body to ENU
  const R_ENU_body = eulerToRotationMatrix(s.euler_rad);

  // Rotate body acceleration to ENU frame
  const a_enu_with_gravity = rotateVector(R_ENU_body, s.accel_ms2);

  // Remove gravity in ENU frame
  // Accelerometer measures specific force (reaction to gravity + motion)
  // When stationary and level, sensor reads ~+1g in its up direction
  // After rotation to ENU: stationary sensor should read [0, 0, +g]
  // To get true acceleration (should be zero when stationary), subtract gravity
  const GRAVITY = 9.80665;
  const a_enu_no_gravity: [number, number, number] = [
    a_enu_with_gravity[0],
    a_enu_with_gravity[1],
    a_enu_with_gravity[2] - GRAVITY
  ];

  // Apply low-pass filter to remove high-frequency noise
  const a_enu_filtered = accelFilter!.filter(a_enu_no_gravity);

  return a_enu_filtered;
}

/**
 * Reset mechanization filter state
 * Call this when starting a new session or after a discontinuity
 */
export function resetMechanization(): void {
  if (accelFilter) {
    accelFilter.reset();
  }
}

/**
 * Convert raw WT9011 0x61 frame data to Imu20 format
 *
 * @param timestamp_ms System timestamp in milliseconds (kept in ms for consistency)
 * @param accel_g Acceleration in g [x, y, z]
 * @param gyro_dps Gyroscope in degrees/s [x, y, z]
 * @param euler_deg Euler angles in degrees [roll, pitch, yaw]
 * @returns Imu20 sample with SI units and timestamp in ms
 */
export function toImu20(
  timestamp_ms: number,
  accel_g: [number, number, number],
  gyro_dps: [number, number, number],
  euler_deg: [number, number, number]
): Imu20 {
  const DEG_TO_RAD = Math.PI / 180;

  return {
    t: timestamp_ms,  // Keep in milliseconds (convert to dt only when computing derivatives)
    accel_ms2: [
      accel_g[0] * 9.80665,
      accel_g[1] * 9.80665,
      accel_g[2] * 9.80665
    ],
    gyro_rads: [
      gyro_dps[0] * DEG_TO_RAD,
      gyro_dps[1] * DEG_TO_RAD,
      gyro_dps[2] * DEG_TO_RAD
    ],
    euler_rad: [
      euler_deg[0] * DEG_TO_RAD,
      euler_deg[1] * DEG_TO_RAD,
      euler_deg[2] * DEG_TO_RAD
    ]
  };
}
