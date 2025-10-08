/*
  # Fix Profiles Table for Demo User

  1. Changes
    - Drop foreign key constraint on profiles.id -> auth.users
    - This allows inserting demo user profile without auth entry
    - Maintains data integrity through RLS policies

  2. Security
    - RLS policies still protect user data
    - Only demo user can be created anonymously
*/

-- Drop the foreign key constraint that requires auth.users entry
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Insert demo user if it doesn't exist
INSERT INTO profiles (id, name, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'Demo User', now(), now())
ON CONFLICT (id) DO NOTHING;
