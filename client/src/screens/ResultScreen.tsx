import Button from "../components/ui/Button";
import type { Room } from "../game/game.types";

interface ResultScreenProps {
  room: Room;
  onPlayAgain: () => void;
}

function ResultScreen({ room, onPlayAgain }: ResultScreenProps) {
  const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
  const winner = leaderboard[0];

  return (
    <section className="screen viewport-screen result-screen">
      <div className="glass-panel result-card">
        <span className="eyebrow">Final results</span>
        <h1>{winner ? `${winner.name} wins` : "Game finished"}</h1>

        <div className="leaderboard-list">
          {leaderboard.map((player, index) => (
            <div key={player.id} className="leaderboard-row">
              <span>#{index + 1}</span>
              <strong>{player.name}</strong>
              <em>{player.score} pts</em>
            </div>
          ))}
        </div>

        <Button onClick={onPlayAgain}>Back to Lobby</Button>
      </div>
    </section>
  );
}

export default ResultScreen;
