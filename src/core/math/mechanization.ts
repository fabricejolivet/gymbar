/**
 * Strapdown Mechanization for Inertial Navigation
 *
 * References:
 * - Titterton & Weston: "Strapdown Inertial Navigation Technology" (reference frames, gravity removal)
 * - Groves: "Principles of GNSS, Inertial, and Multisensor Integrated Navigation Systems" (coordinate transforms)
 *
 * This module converts body-frame IMU measurements to ENU (East-North-Up) frame
 * using Euler angles from the WT9011 sensor and removes gravity.
 *
 * NO FILTERING - EKF process noise provides sufficient smoothing
 *
 * Frame conventions:
 * - Body frame: X-forward, Y-left, Z-up (sensor mounting)
 * - ENU frame: X-East, Y-North, Z-Up (local level)
 * - Euler angles: Z-Y-X convention (Yaw-Pitch-Roll)
 */

export type Imu20 = {
  t: number;  // timestamp in milliseconds
  accel_ms2: [number, number, number];  // body frame, includes gravity
  gyro_rads: [number, number, number];  // body frame
  euler_rad: [number, number, number];  // [roll, pitch, yaw] in Z-Y-X convention
};

/**
 * Initialize mechanization (no-op now, kept for compatibility)
 */
export function initMechanization(cutoffHz?: number): void {
  // No longer needed - filtering removed
}

/**
 * Build rotation matrix from body to ENU using Z-Y-X Euler angles
 *
 * @param euler_rad [roll, pitch, yaw] in radians
 * @returns 3x3 rotation matrix R_ENU_body
 */
function eulerToRotationMatrix(euler_rad: [number, number, number]): number[][] {
  const [roll, pitch, yaw] = euler_rad;

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
 * Convert body-frame acceleration to ENU frame and remove gravity
 *
 * Process:
 * 1. Rotate body acceleration to ENU frame using Euler angles
 * 2. Remove gravity vector [0, 0, -g] in ENU
 * 3. NO FILTERING - Raw acceleration fed to EKF, process noise handles smoothing
 *
 * @param s IMU sample with body accel (includes gravity), gyro, and Euler angles
 * @returns ENU acceleration [m/s²] with gravity removed (NO filtering)
 */
export function bodyToEnuAccelEuler(s: Imu20): [number, number, number] {
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

  return a_enu_no_gravity;
}

/**
 * Reset mechanization state (no-op now, kept for compatibility)
 */
export function resetMechanization(): void {
  // No longer needed - no filter state
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
