import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  time: number;
  created_at: string;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('score', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data;
}

export async function addHighScore(name: string, score: number, time: number): Promise<boolean> {
  const { error } = await supabase
    .from('leaderboard')
    .insert([{ name, score: Math.floor(score), time: Math.floor(time) }]);

  if (error) {
    console.error('Error adding high score:', error);
    return false;
  }

  return true;
}

export async function checkHighScore(score: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('score')
    .order('score', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error checking high score:', error);
    return false;
  }

  // If there are no scores yet, or the current score is higher than the highest score
  return data.length === 0 || score > data[0].score;
}