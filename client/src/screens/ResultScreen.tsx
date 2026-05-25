import Button from "../components/ui/Button";
import type { Room } from "../game/game.types";
import { copyInviteLink } from "../hooks/useInviteLink";

const MEDALS = ["🥇", "🥈", "🥉"];

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
        <span className="eyebrow">Final results · Room {room.id}</span>
        <h1>{winner ? `${winner.name} wins! 🎉` : "Game over!"}</h1>

        <div className="leaderboard-list">
          {leaderboard.map((player, i) => (
            <div key={player.id} className="leaderboard-row">
              <span className="lb-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
              <strong className="lb-name">{player.name}</strong>
              <em className="lb-score">{player.score} pts</em>
            </div>
          ))}
        </div>

        <div className="action-row">
          <Button id="play-again-btn" onClick={onPlayAgain}>
            Back to Lobby
          </Button>
          <Button
            id="result-invite-btn"
            variant="secondary"
            onClick={() => copyInviteLink(room.id)}
          >
            Share Room
          </Button>
        </div>
      </div>
    </section>
  );
}

export default ResultScreen;
