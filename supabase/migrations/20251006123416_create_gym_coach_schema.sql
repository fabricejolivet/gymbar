/*
  # Gym Form Coach Database Schema

  ## Overview
  Creates the complete database schema for the Gym Form Coach application,
  including user profiles, training sessions, exercise sets, and individual rep data.

  ## New Tables

  ### `profiles`
  - `id` (uuid, primary key, references auth.users)
  - `name` (text, required)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### `sessions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles, required)
  - `start_time` (timestamptz, required)
  - `end_time` (timestamptz, nullable)
  - `total_reps` (integer, default 0)
  - `total_calories` (integer, default 0)
  - `created_at` (timestamptz, default now())

  ### `sets`
  - `id` (uuid, primary key)
  - `session_id` (uuid, references sessions, required)
  - `exercise` (text, required)
  - `weight_kg` (numeric, required)
  - `target_reps` (integer, default 0)
  - `actual_reps` (integer, default 0)
  - `avg_balance` (numeric, default 0)
  - `avg_speed` (numeric, default 0)
  - `calories` (integer, default 0)
  - `created_at` (timestamptz, default now())

  ### `reps`
  - `id` (uuid, primary key)
  - `set_id` (uuid, references sets, required)
  - `number` (integer, required)
  - `duration_ms` (integer, required)
  - `balance_percent` (numeric, required)
  - `avg_speed_cms` (numeric, required)
  - `peak_speed_cms` (numeric, required)
  - `rom_cm` (numeric, required)
  - `tilt_deg` (numeric, required)
  - `timestamp` (bigint, required)
  - `created_at` (timestamptz, default now())

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - Authenticated users required for all operations
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  total_reps integer DEFAULT 0,
  total_calories integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create sets table
CREATE TABLE IF NOT EXISTS sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise text NOT NULL DEFAULT 'squat',
  weight_kg numeric NOT NULL DEFAULT 0,
  target_reps integer DEFAULT 0,
  actual_reps integer DEFAULT 0,
  avg_balance numeric DEFAULT 0,
  avg_speed numeric DEFAULT 0,
  calories integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sets"
  ON sets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own sets"
  ON sets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own sets"
  ON sets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own sets"
  ON sets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = auth.uid()
    )
  );

-- Create reps table
CREATE TABLE IF NOT EXISTS reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  number integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  balance_percent numeric NOT NULL DEFAULT 0,
  avg_speed_cms numeric NOT NULL DEFAULT 0,
  peak_speed_cms numeric NOT NULL DEFAULT 0,
  rom_cm numeric NOT NULL DEFAULT 0,
  tilt_deg numeric NOT NULL DEFAULT 0,
  timestamp bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reps"
  ON reps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own reps"
  ON reps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own reps"
  ON reps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own reps"
  ON reps FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = auth.uid()
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sets_session_id ON sets(session_id);
CREATE INDEX IF NOT EXISTS idx_reps_set_id ON reps(set_id);
