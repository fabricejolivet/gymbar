/*
  # User Preferences Table

  1. New Tables
    - `user_preferences`
      - `user_id` (uuid, primary key, references auth.users)
      - `ekf_params` (jsonb) - EKF parameters (Qv, Qba, Rv, Ry)
      - `zupt_params` (jsonb) - ZUPT parameters (a_thr, w_thr, minHoldMs)
      - `rep_speed_params` (jsonb) - Rep speed parameters (targetSpeed, speedTolerance, smoothingWindow, resetThreshold)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_preferences` table
    - Add policy for authenticated users to read/write their own preferences
    - Auto-update `updated_at` timestamp on changes
*/

-- Create user preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ekf_params jsonb DEFAULT '{"Qv": 0.0005, "Qba": 0.000001, "Rv": 0.0002, "Ry": 0.005}'::jsonb,
  zupt_params jsonb DEFAULT '{"a_thr": 0.06, "w_thr": 0.06, "minHoldMs": 200}'::jsonb,
  rep_speed_params jsonb DEFAULT '{"targetSpeed": 0.3, "speedTolerance": 0.1, "smoothingWindow": 3, "resetThreshold": 0.05}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own preferences
CREATE POLICY "Users can read own preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own preferences
CREATE POLICY "Users can delete own preferences"
  ON user_preferences
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_user_preferences_updated_at_trigger ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at_trigger
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences(user_id);
