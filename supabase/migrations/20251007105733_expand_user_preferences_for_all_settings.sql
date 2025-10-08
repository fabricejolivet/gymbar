/*
  # Expand User Preferences for All Settings

  1. Changes
    - Add `workout_preferences` (jsonb) - maxAngle, minROM, restTimer
    - Add `device_settings` (jsonb) - sampleRate, autoCalibrate
    - Add `bar_settings` (jsonb) - preset, calibrationless
    - Add `constraint_settings` (jsonb) - constraint type and axis
    - Add `accel_cutoff` (float) - accelerometer cutoff frequency

  2. Notes
    - Existing columns (ekf_params, zupt_params, rep_speed_params) are preserved
    - All new columns have sensible defaults
*/

-- Add new columns for all settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'workout_preferences'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN workout_preferences jsonb DEFAULT '{"maxAngle": 25, "minROM": 30, "restTimer": true}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'device_settings'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN device_settings jsonb DEFAULT '{"sampleRate": "20", "autoCalibrate": true}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'bar_settings'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN bar_settings jsonb DEFAULT '{"preset": "X_along_bar_Z_up", "calibrationless": true}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'constraint_settings'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN constraint_settings jsonb DEFAULT '{"type": "verticalPlane", "axis": "y"}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'accel_cutoff'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN accel_cutoff float DEFAULT 3.5;
  END IF;
END $$;