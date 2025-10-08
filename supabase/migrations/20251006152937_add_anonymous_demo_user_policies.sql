/*
  # Add Anonymous Demo User Policies

  1. Changes
    - Add policies to allow anonymous users to use demo profile
    - Demo user ID: 00000000-0000-0000-0000-000000000000
    - Allows anonymous users to create and read workout data

  2. Security
    - Only affects demo user with specific UUID
    - Regular authenticated users still use existing policies
    - Anonymous users can only access demo user data
*/

-- Allow anonymous inserts to profiles for demo user
DROP POLICY IF EXISTS "Allow anonymous demo profile" ON profiles;
CREATE POLICY "Allow anonymous demo profile"
  ON profiles FOR INSERT
  TO anon
  WITH CHECK (id = '00000000-0000-0000-0000-000000000000');

-- Allow anonymous to select demo profile
DROP POLICY IF EXISTS "Allow anonymous demo profile select" ON profiles;
CREATE POLICY "Allow anonymous demo profile select"
  ON profiles FOR SELECT
  TO anon
  USING (id = '00000000-0000-0000-0000-000000000000');

-- Allow anonymous inserts to sessions for demo user
DROP POLICY IF EXISTS "Anonymous can create demo sessions" ON sessions;
CREATE POLICY "Anonymous can create demo sessions"
  ON sessions FOR INSERT
  TO anon
  WITH CHECK (user_id = '00000000-0000-0000-0000-000000000000');

-- Allow anonymous to read demo sessions
DROP POLICY IF EXISTS "Anonymous can read demo sessions" ON sessions;
CREATE POLICY "Anonymous can read demo sessions"
  ON sessions FOR SELECT
  TO anon
  USING (user_id = '00000000-0000-0000-0000-000000000000');

-- Allow anonymous inserts to sets for demo user
DROP POLICY IF EXISTS "Anonymous can create demo sets" ON sets;
CREATE POLICY "Anonymous can create demo sets"
  ON sets FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = '00000000-0000-0000-0000-000000000000'
    )
  );

-- Allow anonymous to read demo sets
DROP POLICY IF EXISTS "Anonymous can read demo sets" ON sets;
CREATE POLICY "Anonymous can read demo sets"
  ON sets FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = sets.session_id
      AND sessions.user_id = '00000000-0000-0000-0000-000000000000'
    )
  );

-- Allow anonymous inserts to reps for demo user
DROP POLICY IF EXISTS "Anonymous can create demo reps" ON reps;
CREATE POLICY "Anonymous can create demo reps"
  ON reps FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = '00000000-0000-0000-0000-000000000000'
    )
  );

-- Allow anonymous to read demo reps
DROP POLICY IF EXISTS "Anonymous can read demo reps" ON reps;
CREATE POLICY "Anonymous can read demo reps"
  ON reps FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM sets
      JOIN sessions ON sessions.id = sets.session_id
      WHERE sets.id = reps.set_id
      AND sessions.user_id = '00000000-0000-0000-0000-000000000000'
    )
  );
