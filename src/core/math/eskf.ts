/**
 * Error-State Kalman Filter for Inertial Positioning
 *
 * References:
 * - Solà (2017): "Quaternion kinematics for the error-state Kalman filter" (ESKF rotation math)
 *   https://arxiv.org/abs/1711.02508
 * - OpenShoe: ZUPT-aided EKF implementation patterns and covariance handling
 *   http://www.openshoe.org/
 * - Wahlström & Skog (2020): "Fifteen Years of Progress at Zero Velocity" (ZUPT-aided navigation)
 *   https://arxiv.org/abs/2011.09554
 *
 * This implements an error-state EKF where:
 * - State: position, velocity, accelerometer bias in ENU frame
 * - Attitude is provided externally via Euler angles (future-proof for quaternion upgrade)
 * - Process model: standard strapdown mechanization with bias dynamics
 * - Updates: ZUPT (zero velocity), planar constraints, line constraints
 *
 * State vector (9D):
 *   x = [ p_E, p_N, p_U, v_E, v_N, v_U, b_aE, b_aN, b_aU ]ᵀ
 *
 * where:
 *   p: position in ENU [m]
 *   v: velocity in ENU [m/s]
 *   b_a: accelerometer bias in ENU [m/s²]
 */

export interface EkfState {
  x: Float64Array;  // 9x1 state vector
  P: Float64Array;  // 9x9 covariance matrix (stored row-major)
}

export interface EkfParams {
  // Process noise
  Qv: number;     // m²/s³ - acceleration noise mapped to velocity covariance per step
  Qba: number;    // (m/s²)² - accelerometer bias random walk per step

  // Measurement noise
  Rv: number;     // m²/s² - ZUPT velocity measurement noise
  Ry: number;     // m² - lateral position constraint noise
}

/**
 * Default parameters tuned for 20 Hz IMU sampling
 * Based on OpenShoe defaults and ZUPT literature recommendations
 */
export const DEFAULT_EKF_PARAMS: EkfParams = {
  Qv: 5e-4,    // Process noise for velocity
  Qba: 1e-6,   // Bias random walk
  Rv: 2e-4,    // ZUPT measurement noise
  Ry: 5e-3     // Constraint measurement noise
};

/**
 * Initialize EKF state at origin with zero velocity
 *
 * Initial covariance is set conservatively:
 * - Position: 1 cm uncertainty
 * - Velocity: 1 mm/s uncertainty
 * - Bias: 10 mg uncertainty
 */
export function ekfInit(): EkfState {
  const x = new Float64Array(9);
  const P = new Float64Array(81);

  // Initial state: all zeros (origin, at rest, no bias)
  x.fill(0);

  // Initial covariance (diagonal)
  for (let i = 0; i < 9; i++) {
    P[i * 9 + i] = i < 3 ? 1e-4 :   // position: 1 cm std
                   i < 6 ? 1e-6 :   // velocity: 1 mm/s std
                   1e-4;            // bias: 10 mg std
  }

  return { x, P };
}

/**
 * Matrix operations for 9x9 covariance
 */

function matMul9x9(A: Float64Array, B: Float64Array, result: Float64Array): void {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < 9; k++) {
        sum += A[i * 9 + k] * B[k * 9 + j];
      }
      result[i * 9 + j] = sum;
    }
  }
}

function matAdd9x9(A: Float64Array, B: Float64Array, result: Float64Array): void {
  for (let i = 0; i < 81; i++) {
    result[i] = A[i] + B[i];
  }
}

function matTranspose9x9(A: Float64Array, result: Float64Array): void {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      result[j * 9 + i] = A[i * 9 + j];
    }
  }
}

/**
 * EKF Prediction Step
 *
 * Process model:
 *   v_{k+1} = v_k + (a_enu_k - b_a_k) * dt
 *   p_{k+1} = p_k + v_k * dt + 0.5 * (a_enu_k - b_a_k) * dt²
 *   b_{a,k+1} = b_{a,k} + w_b
 *
 * Linearized dynamics (continuous-time):
 *   ẋ = F * x + G * w
 *
 * where F is the state transition matrix and G maps process noise.
 * We discretize using first-order approximation: Φ ≈ I + F*dt
 *
 * @param s Current state
 * @param dt Time step [s]
 * @param aENU Measured acceleration in ENU frame [m/s²]
 * @param p Parameters
 * @returns Updated state after prediction
 */
export function ekfPredict(
  s: EkfState,
  dt: number,
  aENU: [number, number, number],
  p: EkfParams
): EkfState {
  const x_new = new Float64Array(9);
  const P_new = new Float64Array(81);

  // Extract current state
  const p_enu = [s.x[0], s.x[1], s.x[2]];
  const v_enu = [s.x[3], s.x[4], s.x[5]];
  const b_a = [s.x[6], s.x[7], s.x[8]];

  // Compute bias-corrected acceleration
  const a_corrected = [
    aENU[0] - b_a[0],
    aENU[1] - b_a[1],
    aENU[2] - b_a[2]
  ];

  // State propagation
  const dt2 = dt * dt;
  for (let i = 0; i < 3; i++) {
    x_new[i] = p_enu[i] + v_enu[i] * dt + 0.5 * a_corrected[i] * dt2;  // position
    x_new[i + 3] = v_enu[i] + a_corrected[i] * dt;                      // velocity
    x_new[i + 6] = b_a[i];                                              // bias (random walk)
  }

  // State transition matrix Φ ≈ I + F*dt
  const Phi = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    Phi[i * 9 + i] = 1; // Identity
  }

  // F matrix structure:
  // dp/dt = v           → Φ[0:3, 3:6] = I * dt
  // dv/dt = a - b_a     → Φ[3:6, 6:9] = -I * dt
  // db_a/dt = 0         → already identity
  for (let i = 0; i < 3; i++) {
    Phi[i * 9 + (i + 3)] = dt;        // position depends on velocity
    Phi[(i + 3) * 9 + (i + 6)] = -dt; // velocity depends on bias
  }

  // Process noise covariance Q (discrete-time)
  const Q = new Float64Array(81);
  for (let i = 0; i < 3; i++) {
    Q[(i + 3) * 9 + (i + 3)] = p.Qv * dt;  // velocity noise
    Q[(i + 6) * 9 + (i + 6)] = p.Qba * dt; // bias random walk
  }

  // Covariance propagation: P = Φ * P * Φᵀ + Q
  const temp = new Float64Array(81);
  const PhiT = new Float64Array(81);

  matTranspose9x9(Phi, PhiT);
  matMul9x9(Phi, s.P, temp);      // temp = Φ * P
  matMul9x9(temp, PhiT, P_new);   // P_new = temp * Φᵀ
  matAdd9x9(P_new, Q, P_new);     // P_new += Q

  return { x: x_new, P: P_new };
}

/**
 * ZUPT Measurement Update
 *
 * Applies zero-velocity pseudo-measurement: z = 0 = v + n
 * where n ~ N(0, Rv*I₃)
 *
 * This update anchors velocity to zero when the device is stationary,
 * preventing unbounded drift in position integration.
 *
 * Measurement model:
 *   H = [0₃ I₃ 0₃]  (observes velocity)
 *   z = [0, 0, 0]ᵀ
 *   y = z - H*x = -v  (innovation)
 *
 * Standard Kalman update:
 *   S = H*P*Hᵀ + R
 *   K = P*Hᵀ*S⁻¹
 *   x⁺ = x + K*y
 *   P⁺ = (I - K*H)*P
 *
 * @param s Current state
 * @param p Parameters
 * @returns Updated state after ZUPT correction
 */
export function ekfZuptUpdate(s: EkfState, p: EkfParams): EkfState {
  const x_new = new Float64Array(s.x);
  const P_new = new Float64Array(81);

  // Measurement matrix H (3x9): observes velocity [0 I 0]
  // Innovation: y = 0 - v
  const y = [-s.x[3], -s.x[4], -s.x[5]];

  // S = H*P*Hᵀ + R (3x3)
  // Since H = [0 I 0], H*P*Hᵀ extracts the velocity block P[3:6, 3:6]
  const S = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      S[i * 3 + j] = s.P[(i + 3) * 9 + (j + 3)];
    }
    S[i * 3 + i] += p.Rv; // Add measurement noise
  }

  // Invert S (3x3)
  const S_inv = invert3x3(S);

  // Kalman gain K = P*Hᵀ*S⁻¹ (9x3)
  // Hᵀ is [0 I 0]ᵀ, so P*Hᵀ extracts columns 3:6 of P
  const K = new Float64Array(27);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += s.P[i * 9 + (k + 3)] * S_inv[k * 3 + j];
      }
      K[i * 3 + j] = sum;
    }
  }

  // State update: x⁺ = x + K*y
  for (let i = 0; i < 9; i++) {
    x_new[i] = s.x[i];
    for (let j = 0; j < 3; j++) {
      x_new[i] += K[i * 3 + j] * y[j];
    }
  }

  // Covariance update: P⁺ = (I - K*H)*P
  // K*H is 9x9, where each row i has K[i,:] in columns 3:6
  const I_KH = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      I_KH[i * 9 + j] = (i === j) ? 1 : 0;
    }
  }
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 3; j++) {
      I_KH[i * 9 + (j + 3)] -= K[i * 3 + j];
    }
  }

  matMul9x9(I_KH, s.P, P_new);

  return { x: x_new, P: P_new };
}

/**
 * Planar Constraint Update
 *
 * Constrains lateral position (X or Y in ENU) to remain near zero.
 * Useful for barbell movements that are primarily vertical.
 *
 * Measurement: z = 0 for the specified axis
 * H has a single 1 at position [0,0] for X or [1,1] for Y
 *
 * @param s Current state
 * @param axis 'x' for East, 'y' for North
 * @param p Parameters
 * @returns Updated state
 */
export function ekfPlanarUpdate(
  s: EkfState,
  axis: 'x' | 'y',
  p: EkfParams
): EkfState {
  const idx = axis === 'x' ? 0 : 1;

  const x_new = new Float64Array(s.x);
  const P_new = new Float64Array(s.P);

  // Innovation: y = 0 - p[idx]
  const y = -s.x[idx];

  // S = H*P*Hᵀ + R (scalar)
  const S = s.P[idx * 9 + idx] + p.Ry;
  const S_inv = 1 / S;

  // Kalman gain K = P*Hᵀ*S⁻¹ (9x1 vector, column idx of P)
  const K = new Float64Array(9);
  for (let i = 0; i < 9; i++) {
    K[i] = s.P[i * 9 + idx] * S_inv;
  }

  // State update
  for (let i = 0; i < 9; i++) {
    x_new[i] = s.x[i] + K[i] * y;
  }

  // Covariance update: P⁺ = (I - K*H)*P
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      P_new[i * 9 + j] = s.P[i * 9 + j] - K[i] * s.P[idx * 9 + j];
    }
  }

  return { x: x_new, P: P_new };
}

/**
 * Line-Vertical Constraint Update
 *
 * Constrains XY position to stay near a vertical line through anchorXY.
 * Applies soft constraints to both X and Y positions.
 *
 * @param s Current state
 * @param anchorXY [East, North] position of the vertical line
 * @param p Parameters
 * @returns Updated state
 */
export function ekfLineVerticalUpdate(
  s: EkfState,
  anchorXY: [number, number],
  p: EkfParams
): EkfState {
  let state = s;

  // Apply X constraint
  const x_new = new Float64Array(state.x);
  x_new[0] = state.x[0]; // temporary copy
  const y_x = anchorXY[0] - state.x[0];

  const S_x = state.P[0] + p.Ry;
  const S_x_inv = 1 / S_x;

  const K_x = new Float64Array(9);
  for (let i = 0; i < 9; i++) {
    K_x[i] = state.P[i * 9] * S_x_inv;
  }

  for (let i = 0; i < 9; i++) {
    x_new[i] = state.x[i] + K_x[i] * y_x;
  }

  const P_temp = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      P_temp[i * 9 + j] = state.P[i * 9 + j] - K_x[i] * state.P[j];
    }
  }

  state = { x: x_new, P: P_temp };

  // Apply Y constraint
  const x_new2 = new Float64Array(state.x);
  const y_y = anchorXY[1] - state.x[1];

  const S_y = state.P[10] + p.Ry;
  const S_y_inv = 1 / S_y;

  const K_y = new Float64Array(9);
  for (let i = 0; i < 9; i++) {
    K_y[i] = state.P[i * 9 + 1] * S_y_inv;
  }

  for (let i = 0; i < 9; i++) {
    x_new2[i] = state.x[i] + K_y[i] * y_y;
  }

  const P_new = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      P_new[i * 9 + j] = state.P[i * 9 + j] - K_y[i] * state.P[9 + j];
    }
  }

  return { x: x_new2, P: P_new };
}

/**
 * Invert 3x3 matrix (helper for ZUPT update)
 */
function invert3x3(M: Float64Array): Float64Array {
  const inv = new Float64Array(9);

  const m00 = M[0], m01 = M[1], m02 = M[2];
  const m10 = M[3], m11 = M[4], m12 = M[5];
  const m20 = M[6], m21 = M[7], m22 = M[8];

  const det = m00 * (m11 * m22 - m12 * m21) -
              m01 * (m10 * m22 - m12 * m20) +
              m02 * (m10 * m21 - m11 * m20);

  if (Math.abs(det) < 1e-10) {
    // Singular matrix, return identity
    for (let i = 0; i < 3; i++) inv[i * 3 + i] = 1;
    return inv;
  }

  const invDet = 1 / det;

  inv[0] = (m11 * m22 - m12 * m21) * invDet;
  inv[1] = (m02 * m21 - m01 * m22) * invDet;
  inv[2] = (m01 * m12 - m02 * m11) * invDet;
  inv[3] = (m12 * m20 - m10 * m22) * invDet;
  inv[4] = (m00 * m22 - m02 * m20) * invDet;
  inv[5] = (m02 * m10 - m00 * m12) * invDet;
  inv[6] = (m10 * m21 - m11 * m20) * invDet;
  inv[7] = (m01 * m20 - m00 * m21) * invDet;
  inv[8] = (m00 * m11 - m01 * m10) * invDet;

  return inv;
}
