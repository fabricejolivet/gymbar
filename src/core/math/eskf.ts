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
  Ra?: number;    // (m/s²)² - ZARU accel-bias measurement noise (optional, for drift elimination)
}

/**
 * Default parameters tuned for 20 Hz IMU sampling
 * Based on OpenShoe defaults and ZUPT literature recommendations
 */
export const DEFAULT_EKF_PARAMS: EkfParams = {
  Qv: 5e-4,    // σ_a² acceleration noise power (m²/s⁴)
  Qba: 1e-6,   // Bias random walk (m/s²)²/s
  Rv: 2e-4,    // ZUPT measurement noise (m²/s²)
  Ry: 5e-3,    // Constraint measurement noise (m²)
  Ra: 1e-4     // ZARU accel-bias measurement noise (m/s²)² - good for 20 Hz with LPF ~3.5-4.5 Hz
};

/**
 * Initialize EKF state at origin with zero velocity
 *
 * Initial covariance is set conservatively:
 * - Position: 1 cm std (1e-4 m²)
 * - Velocity: 1 mm/s std (1e-6 m²/s²)
 * - Bias: 0.01 m/s² std = ~1 mg (1e-4 (m/s²)²)
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
                   1e-4;            // bias: 0.01 m/s² = ~1 mg std
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
 * Symmetrize covariance matrix to combat numerical drift
 * P := (P + Pᵀ) / 2
 *
 * Call after every update to maintain PSD property
 */
function symmetrize9(P: Float64Array): void {
  for (let i = 0; i < 9; i++) {
    for (let j = i + 1; j < 9; j++) {
      const avg = 0.5 * (P[i * 9 + j] + P[j * 9 + i]);
      P[i * 9 + j] = avg;
      P[j * 9 + i] = avg;
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
  const dt2_state = dt * dt;
  for (let i = 0; i < 3; i++) {
    x_new[i] = p_enu[i] + v_enu[i] * dt + 0.5 * a_corrected[i] * dt2_state;  // position
    x_new[i + 3] = v_enu[i] + a_corrected[i] * dt;                            // velocity
    x_new[i + 6] = b_a[i];                                                    // bias (random walk)
  }

  // State transition matrix Φ ≈ I + F*dt
  const Phi = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    Phi[i * 9 + i] = 1; // Identity
  }

  // F matrix structure (continuous-time):
  // dp/dt = v           → Φ[0:3, 3:6] = I * dt
  // dv/dt = a - b_a     → Φ[3:6, 6:9] = -I * dt
  // dp/dba = -0.5*dt^2  → Φ[0:3, 6:9] = -0.5*I * dt^2 (CRITICAL: missing coupling!)
  // db_a/dt = 0         → already identity
  for (let i = 0; i < 3; i++) {
    Phi[i * 9 + (i + 3)] = dt;                  // dp/dv
    Phi[(i + 3) * 9 + (i + 6)] = -dt;           // dv/dba
    Phi[i * 9 + (i + 6)] = -0.5 * dt * dt;      // dp/dba (NEW!)
  }

  // Process noise covariance Q (discrete-time)
  // White noise acceleration σ_a² = p.Qv propagates to (p,v) block
  const Q = new Float64Array(81);
  const s2 = p.Qv;  // σ_a² (m²/s⁴)
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt2 * dt2;

  // For each axis, fill position/velocity covariance block:
  // Q_pv = σ_a² * [[dt⁴/4, dt³/2],
  //                [dt³/2, dt²   ]]
  for (let a = 0; a < 3; a++) {
    const Pidx = a;       // position index (pE=0, pN=1, pU=2)
    const Vidx = a + 3;   // velocity index
    Q[Pidx * 9 + Pidx] += s2 * (dt4 / 4);   // Q_pp
    Q[Pidx * 9 + Vidx] += s2 * (dt3 / 2);   // Q_pv
    Q[Vidx * 9 + Pidx] += s2 * (dt3 / 2);   // Q_vp (symmetric)
    Q[Vidx * 9 + Vidx] += s2 * dt2;         // Q_vv
  }

  // Bias random walk (diagonal)
  for (let i = 6; i < 9; i++) {
    Q[i * 9 + i] += p.Qba * dt;
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

  // Covariance update: Joseph form for numerical stability
  // P⁺ = (I - K*H)*P*(I - K*H)ᵀ + K*R*Kᵀ

  // Build H explicitly (3x9): H = [0₃ I₃ 0₃]
  const H = new Float64Array(27);
  H[0 * 9 + 3] = 1; // row 0, col 3
  H[1 * 9 + 4] = 1; // row 1, col 4
  H[2 * 9 + 5] = 1; // row 2, col 5

  // Compute I - K*H (9x9)
  const I = new Float64Array(81);
  for (let i = 0; i < 9; i++) I[i * 9 + i] = 1;

  const KH = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += K[i * 3 + k] * H[k * 9 + j];
      }
      KH[i * 9 + j] = sum;
    }
  }

  const IKH = new Float64Array(81);
  for (let i = 0; i < 81; i++) IKH[i] = I[i] - KH[i];

  // Term1 = (I-K*H) * P * (I-K*H)ᵀ
  const temp = new Float64Array(81);
  const IKHt = new Float64Array(81);
  matTranspose9x9(IKH, IKHt);
  matMul9x9(IKH, s.P, temp);
  const term1 = new Float64Array(81);
  matMul9x9(temp, IKHt, term1);

  // Term2 = K * R * Kᵀ  where R = p.Rv * I₃
  const KKt = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += K[i * 3 + k] * K[j * 3 + k];
      }
      KKt[i * 9 + j] = sum;
    }
  }
  const term2 = new Float64Array(81);
  for (let i = 0; i < 81; i++) term2[i] = p.Rv * KKt[i];

  // P⁺ = term1 + term2
  matAdd9x9(term1, term2, P_new);

  // Symmetrize to combat numerical drift
  symmetrize9(P_new);

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

  // Covariance update: Joseph form
  // P⁺ = (I - K*H)*P*(I - K*H)ᵀ + K*R*Kᵀ
  // H is a row vector with 1 at position idx, R is scalar p.Ry

  const IKH = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      IKH[i * 9 + j] = (i === j ? 1 : 0) - K[i] * (j === idx ? 1 : 0);
    }
  }

  const temp = new Float64Array(81);
  const IKHt = new Float64Array(81);
  matTranspose9x9(IKH, IKHt);
  matMul9x9(IKH, s.P, temp);
  matMul9x9(temp, IKHt, P_new);

  // Add K*R*Kᵀ term
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      P_new[i * 9 + j] += K[i] * p.Ry * K[j];
    }
  }

  // Symmetrize to combat numerical drift
  symmetrize9(P_new);

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

  // Apply X constraint with Joseph form
  const x_new = new Float64Array(state.x);
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

  // Joseph form covariance update
  const IKH_x = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      IKH_x[i * 9 + j] = (i === j ? 1 : 0) - K_x[i] * (j === 0 ? 1 : 0);
    }
  }

  const temp_x = new Float64Array(81);
  const IKHt_x = new Float64Array(81);
  matTranspose9x9(IKH_x, IKHt_x);
  matMul9x9(IKH_x, state.P, temp_x);
  const P_temp = new Float64Array(81);
  matMul9x9(temp_x, IKHt_x, P_temp);

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      P_temp[i * 9 + j] += K_x[i] * p.Ry * K_x[j];
    }
  }

  // Symmetrize X update
  symmetrize9(P_temp);

  state = { x: x_new, P: P_temp };

  // Apply Y constraint with Joseph form
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

  // Joseph form covariance update for Y
  const IKH_y = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      IKH_y[i * 9 + j] = (i === j ? 1 : 0) - K_y[i] * (j === 1 ? 1 : 0);
    }
  }

  const temp_y = new Float64Array(81);
  const IKHt_y = new Float64Array(81);
  matTranspose9x9(IKH_y, IKHt_y);
  matMul9x9(IKH_y, state.P, temp_y);
  const P_new = new Float64Array(81);
  matMul9x9(temp_y, IKHt_y, P_new);

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      P_new[i * 9 + j] += K_y[i] * p.Ry * K_y[j];
    }
  }

  // Symmetrize Y update
  symmetrize9(P_new);

  return { x: x_new2, P: P_new };
}

/**
 * ZARU (Zero-Acceleration Rate Update)
 *
 * Drives accelerometer bias toward measured ENU acceleration during ZUPT periods.
 * This eliminates position drift by quickly adapting bias when the sensor is stationary.
 *
 * Key insight: During ZUPT, true acceleration ≈ 0, so a_enu ≈ bias error.
 * We use this to pseudo-measure the bias directly.
 *
 * Measurement model:
 *   z = a_enu (measured ENU accel during stationary period)
 *   H = [0₃ 0₃ I₃]  (observes only bias)
 *   y = z - H*x = a_enu - b_a  (innovation)
 *
 * Standard Kalman update with Joseph form for numerical stability.
 *
 * @param s Current state
 * @param aENU Measured ENU acceleration [E, N, U] in m/s²
 * @param p Parameters (uses Ra for measurement noise)
 * @returns Updated state with corrected bias
 */
export function ekfZaruUpdate(
  s: EkfState,
  aENU: [number, number, number],
  p: EkfParams
): EkfState {
  const x = new Float64Array(s.x);
  const P = new Float64Array(s.P);
  const R = p.Ra ?? 1e-4;  // Treat as scalar noise on each bias component

  // Measurement matrix H (3x9): observes only bias [0 0 I]
  const H = new Float64Array(27);
  H[0 * 9 + 6] = 1;  // row 0 observes bias_x
  H[1 * 9 + 7] = 1;  // row 1 observes bias_y
  H[2 * 9 + 8] = 1;  // row 2 observes bias_z

  // Innovation: y = z - H*x = a_enu - b_a
  const y = new Float64Array([
    aENU[0] - x[6],
    aENU[1] - x[7],
    aENU[2] - x[8]
  ]);

  // S = H*P*Hᵀ + R (3x3)
  // H*P*Hᵀ extracts the bias covariance block P[6:9, 6:9]
  const S = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      S[i * 3 + j] = P[(i + 6) * 9 + (j + 6)];
    }
    S[i * 3 + i] += R;  // Add measurement noise on diagonal
  }

  // Invert S
  const Sinv = invert3x3(S);

  // Kalman gain K = P*Hᵀ*S⁻¹ (9x3)
  // Hᵀ extracts columns 6:9 of P
  const K = new Float64Array(27);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += P[i * 9 + (k + 6)] * Sinv[k * 3 + j];
      }
      K[i * 3 + j] = sum;
    }
  }

  // State update: x⁺ = x + K*y
  for (let i = 0; i < 9; i++) {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      sum += K[i * 3 + j] * y[j];
    }
    x[i] += sum;
  }

  // Covariance update: Joseph form for numerical stability
  // P⁺ = (I - K*H)*P*(I - K*H)ᵀ + K*R*Kᵀ

  const I = new Float64Array(81);
  for (let i = 0; i < 9; i++) I[i * 9 + i] = 1;

  // K*H (9x9)
  const KH = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += K[i * 3 + k] * H[k * 9 + j];
      }
      KH[i * 9 + j] = sum;
    }
  }

  // I - K*H
  const IKH = new Float64Array(81);
  for (let i = 0; i < 81; i++) {
    IKH[i] = I[i] - KH[i];
  }

  // Term1 = (I - K*H) * P * (I - K*H)ᵀ
  const temp = new Float64Array(81);
  const IKHt = new Float64Array(81);
  matTranspose9x9(IKH, IKHt);
  matMul9x9(IKH, P, temp);
  const term1 = new Float64Array(81);
  matMul9x9(temp, IKHt, term1);

  // Term2 = K * R * Kᵀ (R is scalar, so R*I₃)
  const KKt = new Float64Array(81);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += K[i * 3 + k] * K[j * 3 + k];
      }
      KKt[i * 9 + j] = sum * R;
    }
  }

  // P⁺ = term1 + term2
  const Pn = new Float64Array(81);
  matAdd9x9(term1, KKt, Pn);

  // Symmetrize to combat numerical drift
  symmetrize9(Pn);

  return { x, P: Pn };
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
