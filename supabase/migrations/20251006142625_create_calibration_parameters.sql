/*
  # Calibration Parameters Storage

  1. New Tables
    - `calibration_parameters`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `accel_process_noise` (float, Q parameter for acceleration Kalman filter)
      - `accel_measurement_noise` (float, R parameter for acceleration Kalman filter)
      - `velocity_process_noise` (float, Q parameter for velocity Kalman filter)
      - `velocity_measurement_noise` (float, R parameter for velocity Kalman filter)
      - `max_displacement_x` (float, observed max X displacement in cm)
      - `max_displacement_y` (float, observed max Y displacement in cm)
      - `max_displacement_z` (float, observed max Z displacement in cm)
      - `samples_collected` (integer, number of samples in calibration)
      - `auto_tuned` (boolean, whether parameters were auto-calculated)
      - `created_at` (timestamptz)
    
    - `calibration_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `raw_data` (jsonb, array of calibration samples)
      - `results` (jsonb, calculated results and metrics)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can read/write only their own calibration data
*/

CREATE TABLE IF NOT EXISTS calibration_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  accel_process_noise float DEFAULT 0.05,
  accel_measurement_noise float DEFAULT 0.5,
  velocity_process_noise float DEFAULT 0.1,
  velocity_measurement_noise float DEFAULT 0.8,
  max_displacement_x float DEFAULT 0,
  max_displacement_y float DEFAULT 0,
  max_displacement_z float DEFAULT 0,
  samples_collected integer DEFAULT 0,
  auto_tuned boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calibration_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_data jsonb DEFAULT '[]'::jsonb,
  results jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE calibration_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own calibration parameters"
  ON calibration_parameters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calibration parameters"
  ON calibration_parameters
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calibration parameters"
  ON calibration_parameters
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calibration parameters"
  ON calibration_parameters
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own calibration sessions"
  ON calibration_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calibration sessions"
  ON calibration_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calibration sessions"
  ON calibration_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calibration_parameters_user_id ON calibration_parameters(user_id);
CREATE INDEX IF NOT EXISTS idx_calibration_sessions_user_id ON calibration_sessions(user_id);
