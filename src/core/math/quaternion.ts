export type Quaternion = [number, number, number, number];
export type Vec3 = [number, number, number];

export function quatMultiply(q1: Quaternion, q2: Quaternion): Quaternion {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;

  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

export function quatConjugate(q: Quaternion): Quaternion {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function quatRotateVector(q: Quaternion, v: Vec3): Vec3 {
  const qv: Quaternion = [0, v[0], v[1], v[2]];
  const qConj = quatConjugate(q);
  const result = quatMultiply(quatMultiply(q, qv), qConj);
  return [result[1], result[2], result[3]];
}

export function eulerToQuat(roll: number, pitch: number, yaw: number): Quaternion {
  const cr = Math.cos(roll * 0.5 * Math.PI / 180);
  const sr = Math.sin(roll * 0.5 * Math.PI / 180);
  const cp = Math.cos(pitch * 0.5 * Math.PI / 180);
  const sp = Math.sin(pitch * 0.5 * Math.PI / 180);
  const cy = Math.cos(yaw * 0.5 * Math.PI / 180);
  const sy = Math.sin(yaw * 0.5 * Math.PI / 180);

  const w = cr * cp * cy + sr * sp * sy;
  const x = sr * cp * cy - cr * sp * sy;
  const y = cr * sp * cy + sr * cp * sy;
  const z = cr * cp * sy - sr * sp * cy;

  return [w, x, y, z];
}

export function bodyToENU(accel_body_g: Vec3, quat: Quaternion): Vec3 {
  const G = 9.80665;
  const accel_body_ms2: Vec3 = [
    accel_body_g[0] * G,
    accel_body_g[1] * G,
    accel_body_g[2] * G,
  ];

  const accel_enu_ms2 = quatRotateVector(quat, accel_body_ms2);

  accel_enu_ms2[2] -= G;

  return accel_enu_ms2;
}
