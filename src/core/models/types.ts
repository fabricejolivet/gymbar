export type ImuSample = {
  t: number;
  accel_g: [number, number, number];
  gyro_dps: [number, number, number];
  euler_deg: [number, number, number];
  quat?: [number, number, number, number];
  mag_uT?: [number, number, number];
};

export type DeviceInfo = {
  name: string;
  id: string;
  rssi?: number;
  connected: boolean;
};

export type ExerciseType = 'squat' | 'bench' | 'deadlift' | 'press' | 'row' | 'custom';

export type Rep = {
  number: number;
  timestamp: number;
  duration_ms: number;
  balance_percent: number;
  avg_speed_cms: number;
  peak_speed_cms: number;
  rom_cm: number;
  tilt_deg: number;
};

export type SetMetrics = {
  reps: number;
  avg_balance: number;
  avg_speed: number;
  weight_kg: number;
  calories: number;
};

export type SetResult = {
  id: string;
  exercise: ExerciseType;
  weight_kg: number;
  target_reps: number;
  actual_reps: number;
  reps: Rep[];
  metrics: SetMetrics;
  timestamp: number;
};

export type Session = {
  id: string;
  user_id: string;
  start_time: number;
  end_time?: number;
  sets: SetResult[];
  total_reps: number;
  total_calories: number;
};

export type User = {
  id: string;
  name: string;
  email?: string;
  created_at: number;
};

export type ENUFrame = {
  t: number;
  accel_enu_ms2: [number, number, number];
  velocity_enu_cms: [number, number, number];
  position_enu_cm: [number, number, number];
  orientation_quat: [number, number, number, number];
};
