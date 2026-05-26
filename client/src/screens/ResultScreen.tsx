import { useEffect, useState } from "react";
import Button from "../components/ui/Button";
import type { Room } from "../game/game.types";
import { copyInviteLink } from "../hooks/useInviteLink";
import { socket } from "../socket/socket";

const MEDALS = ["🥇", "🥈", "🥉"];
const CONFETTI_COLORS = ["#22d3ee", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#fb923c"];

interface ResultScreenProps {
  room: Room;
  onPlayAgain: () => void;
}

function Confetti() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    size: `${6 + Math.random() * 8}px`,
    duration: `${2 + Math.random() * 2}s`,
  }));

  return (
    <div className="confetti-container" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            background: p.color,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}

function ResultScreen({ room, onPlayAgain }: ResultScreenProps) {
  const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
  const winner = leaderboard[0];
  const isWinner = winner?.id === socket.id;
  const [show, setShow] = useState(false);

  // Staggered entrance
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="screen viewport-screen result-screen">
      <Confetti />

      <div className={`result-card glass-panel ${show ? "result-card--visible" : ""}`}>

        {/* Header */}
        <div className="result-header">
          <span className="eyebrow">Game Over · {room.maxRounds} Rounds · Room {room.id}</span>
          <div className="winner-trophy">🏆</div>
          <h1 className="winner-headline">
            {winner ? (
              isWinner ? "You Win! 🎉" : `${winner.name} Wins! 🎉`
            ) : "It's a draw!"}
          </h1>
          {winner && !isWinner && (
            <p className="winner-sub">Better luck next time — you gave it your all!</p>
          )}
          {isWinner && (
            <p className="winner-sub winner-sub--you">Outstanding drawing skills! 🎨</p>
          )}
        </div>

        {/* Leaderboard */}
        <div className="result-leaderboard">
          <p className="result-section-label">Final Standings</p>
          <div className="leaderboard-list">
            {leaderboard.map((player, i) => {
              const isYou = player.id === socket.id;
              const isTopThree = i < 3;
              return (
                <div
                  key={player.id}
                  className={`leaderboard-row ${isTopThree ? "leaderboard-row--top" : ""} ${isYou ? "leaderboard-row--you" : ""}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="lb-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
                  <strong className="lb-name">
                    {player.name}
                    {isYou && <span className="you-chip"> You</span>}
                  </strong>
                  <div className="lb-score-wrap">
                    <em className="lb-score">{player.score.toLocaleString()}</em>
                    <span className="lb-score-label">pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="result-actions">
          <Button id="play-again-btn" onClick={onPlayAgain}>
            Play Again
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
