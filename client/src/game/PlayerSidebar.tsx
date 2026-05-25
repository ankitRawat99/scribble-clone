import { socket } from "../socket/socket";
import type { Room } from "./game.types";

interface PlayerSidebarProps {
  room: Room;
}

function PlayerSidebar({ room }: PlayerSidebarProps) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <section className="player-sidebar glass-panel">
      <div className="sidebar-header">
        <h3>Players</h3>
        <span className="round-pill">{room.players.length}/12</span>
      </div>

      <ul className="sidebar-list">
        {sorted.map((player, rank) => {
          const isCurrentPlayer = player.id === socket.id;
          const isDrawer = player.id === room.currentDrawerId;
          const hasGuessed = room.guessedPlayerIds.includes(player.id);

          return (
            <li
              key={player.id}
              className={[
                "sidebar-player",
                isCurrentPlayer ? "is-you" : "",
                isDrawer ? "active-drawer" : "",
                hasGuessed ? "has-guessed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Rank medal for top 3 */}
              <span className="player-rank">
                {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `${rank + 1}.`}
              </span>

              <div className="player-info">
                <span className="player-name">{player.name}</span>
                <div className="player-badges">
                  {isCurrentPlayer && <span className="you-badge">You</span>}
                  {isDrawer && (
                    <span className="drawer-badge">
                      ✏️ Drawing
                    </span>
                  )}
                  {hasGuessed && !isDrawer && (
                    <span className="guessed-badge">✓ Guessed</span>
                  )}
                </div>
              </div>

              <strong className="player-score">{player.score}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default PlayerSidebar;
