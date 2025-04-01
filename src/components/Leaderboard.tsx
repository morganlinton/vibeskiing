import React, { useEffect } from 'react';
import { getLeaderboard, addHighScore, checkHighScore, LeaderboardEntry } from '../lib/supabase';

interface LeaderboardProps {
  isVisible: boolean;
  currentScore: number;
  currentTime: number;
  onRestart: () => void;
}

export default function Leaderboard({ isVisible, currentScore, currentTime, onRestart }: LeaderboardProps) {
  const [playerName, setPlayerName] = React.useState('');
  const [hasSubmitted, setHasSubmitted] = React.useState(false);
  const [isHighScore, setIsHighScore] = React.useState(false);
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  useEffect(() => {
    if (isVisible) {
      const checkScore = async () => {
        // Check if score qualifies for top 10
        // This will return true if:
        // 1. There are fewer than 10 scores on the leaderboard
        // 2. OR the player's score is higher than the lowest score in the top 10
        const isHigh = await checkHighScore(currentScore);
        setIsHighScore(isHigh);
        
        // Get the current leaderboard to display
        const board = await getLeaderboard();
        setLeaderboard(board);
        setIsLoading(false);
      };
      checkScore();
    }
  }, [isVisible, currentScore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      setIsLoading(true);
      const success = await addHighScore(playerName.trim().toUpperCase(), currentScore, currentTime);
      if (success) {
        const updatedBoard = await getLeaderboard();
        setLeaderboard(updatedBoard);
        setHasSubmitted(true);
      }
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-20">
      <div className="bg-black/50 p-8 rounded-lg max-w-md w-full backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-white mb-4">Game Over!</h2>
        <div className="mb-6">
          <p className="text-white">Final Score: {Math.floor(currentScore)}</p>
          <p className="text-white">Time Survived: {Math.floor(currentTime)}s</p>
        </div>

        {isLoading ? (
          <div className="text-center text-white mb-6">
            Loading...
          </div>
        ) : (
          <>
            {isHighScore && !hasSubmitted && (
              <form onSubmit={handleSubmit} className="mb-6">
                <h3 className="text-white text-lg mb-2">You Made the Top 10!</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="Enter your initials"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                    className="bg-white/10 text-white border border-white/20 rounded px-3 py-2 w-full"
                  />
                  <button
                    type="submit"
                    className="bg-white/20 text-white px-4 py-2 rounded hover:bg-white/30 transition"
                  >
                    Submit
                  </button>
                </div>
              </form>
            )}

            <div className="mb-6">
              <h3 className="text-white text-lg mb-2">Global Leaderboard</h3>
              <div className="space-y-2">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex justify-between text-white ${
                      entry.score === Math.floor(currentScore) && hasSubmitted ? 'bg-white/20' : ''
                    } p-2 rounded`}
                  >
                    <span>{entry.name}</span>
                    <span className="flex gap-4">
                      <span>{Math.floor(entry.score)}</span>
                      <span>{Math.floor(entry.time)}s</span>
                    </span>
                  </div>
                ))}
                {leaderboard.length === 0 && (
                  <p className="text-white/50 text-center">No high scores yet!</p>
                )}
              </div>
            </div>
          </>
        )}

        <button
          onClick={onRestart}
          className="w-full bg-white/20 text-white px-4 py-2 rounded hover:bg-white/30 transition"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}