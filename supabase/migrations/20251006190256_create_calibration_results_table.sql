/*
  # Create Calibration Results Table

  1. New Tables
    - `calibration_results`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `created_at` (timestamptz, default now())
      - `confidence` (float4)
      - `config` (jsonb) - stores all EKF config parameters
      - `metrics` (jsonb) - stores gyro noise, accel noise, timing stability, etc.
      - `reason` (text) - explanation of calibration result
      - `applied` (boolean, default false) - whether user applied this calibration

  2. Security
    - Enable RLS on `calibration_results` table
    - Add policies for authenticated users to manage their own calibration results
*/

CREATE TABLE IF NOT EXISTS calibration_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  confidence float4 NOT NULL,
  config jsonb NOT NULL,
  metrics jsonb NOT NULL,
  reason text NOT NULL,
  applied boolean DEFAULT false
);

ALTER TABLE calibration_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calibration results"
  ON calibration_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calibration results"
  ON calibration_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calibration results"
  ON calibration_results FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calibration results"
  ON calibration_results FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS calibration_results_user_id_idx ON calibration_results(user_id);
CREATE INDEX IF NOT EXISTS calibration_results_created_at_idx ON calibration_results(created_at DESC);
