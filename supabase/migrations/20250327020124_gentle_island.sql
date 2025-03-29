/*
  # Create leaderboard table

  1. New Tables
    - `leaderboard`
      - `id` (uuid, primary key)
      - `name` (text, player's initials)
      - `score` (integer)
      - `time` (integer, seconds survived)
      - `created_at` (timestamp with timezone)

  2. Security
    - Enable RLS on `leaderboard` table
    - Add policy for anyone to read leaderboard entries
    - Add policy for anyone to insert their own scores
*/

CREATE TABLE IF NOT EXISTS leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) <= 3),
  score integer NOT NULL,
  time integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the leaderboard
CREATE POLICY "Anyone can read leaderboard"
  ON leaderboard
  FOR SELECT
  TO public
  USING (true);

-- Allow anyone to insert new scores
CREATE POLICY "Anyone can insert scores"
  ON leaderboard
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create index for faster sorting
CREATE INDEX leaderboard_score_idx ON leaderboard (score DESC);