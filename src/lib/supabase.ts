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
  // First add the new high score
  const { error: insertError } = await supabase
    .from('leaderboard')
    .insert([{ name, score: Math.floor(score), time: Math.floor(time) }]);

  if (insertError) {
    console.error('Error adding high score:', insertError);
    return false;
  }

  // Then fetch all scores ordered by score (highest first)
  const { data: allScores, error: fetchError } = await supabase
    .from('leaderboard')
    .select('id, score')
    .order('score', { ascending: false });

  if (fetchError) {
    console.error('Error fetching scores for cleanup:', fetchError);
    // Return true anyway since we successfully added the score
    return true;
  }

  // If we have more than 10 entries, remove the excess (lowest scores)
  if (allScores.length > 10) {
    // Get IDs of scores to remove (everything after the 10th position)
    const scoreIdsToRemove = allScores
      .slice(10)
      .map(entry => entry.id);

    // Delete the excess scores
    const { error: deleteError } = await supabase
      .from('leaderboard')
      .delete()
      .in('id', scoreIdsToRemove);

    if (deleteError) {
      console.error('Error removing lowest scores:', deleteError);
    }
  }

  return true;
}

export async function checkHighScore(score: number): Promise<boolean> {
  // Get all the current scores on the leaderboard (max 10)
  const { data, error } = await supabase
    .from('leaderboard')
    .select('score')
    .order('score', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error checking high score:', error);
    return false;
  }

  // If there are fewer than 10 scores on the leaderboard, any new score qualifies
  if (data.length < 10) {
    return true;
  }

  // If we already have 10 scores, check if the new score is higher than the lowest 
  // score currently on the leaderboard, which would qualify it for the top 10
  const lowestScore = data[data.length - 1].score;
  return score > lowestScore;
}