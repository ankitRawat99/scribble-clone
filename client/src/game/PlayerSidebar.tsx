import { socket } from "../socket/socket";
import type { Room } from "./game.types";

interface PlayerSidebarProps {
  room: Room;
}

function PlayerSidebar({ room }: PlayerSidebarProps) {
  return (
    <aside className="player-sidebar">
      <div className="sidebar-header">
        <h3>Players</h3>
        <span>Round {room.currentRound}</span>
      </div>

      <ul>
        {room.players.map((player) => {
          const isCurrentPlayer = player.id === socket.id;
          const isDrawer = player.id === room.currentDrawerId;

          return (
            <li
              key={player.id}
              className={`sidebar-player ${isCurrentPlayer ? "current-player" : ""} ${
                isDrawer ? "active-drawer" : ""
              }`}
            >
              <div>
                <span className="player-name">{player.name}</span>
                {isCurrentPlayer && <span className="you-badge">(You)</span>}
                {isDrawer && <span className="host-badge">Drawer</span>}
              </div>
              <strong>{player.score}</strong>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export default PlayerSidebar;
