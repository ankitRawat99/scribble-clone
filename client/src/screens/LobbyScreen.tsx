import { socket } from "../socket/socket";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import type { Room } from "../game/game.types";

interface LobbyScreenProps {
  room: Room | null;
  playerName: string;
  roomId: string;
  error: string;
  isLoading: boolean;
  onPlayerNameChange: (value: string) => void;
  onRoomIdChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

function LobbyScreen({
  room,
  playerName,
  roomId,
  error,
  isLoading,
  onPlayerNameChange,
  onRoomIdChange,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onStartGame,
  onLeaveRoom,
}: LobbyScreenProps) {
  const isHost = Boolean(room && room.hostId === socket.id);
  const currentPlayer = room?.players.find((player) => player.id === socket.id);
  const allReady = Boolean(room && room.players.length >= 2 && room.players.every((player) => player.isReady));
  const canStart = isHost && allReady;

  if (!room) {
    return (
      <section className="screen viewport-screen lobby-entry">
        <div className="hero-copy">
          <Badge tone="cyan">Realtime drawing party</Badge>
          <h1>Skribbl Arena</h1>
          <p>Spin up a private room, ready your squad, and draw in sync.</p>
        </div>

        <div className="glass-panel join-panel">
          <label>
            Name
            <input
              value={playerName}
              onChange={(event) => onPlayerNameChange(event.target.value)}
              placeholder="Your display name"
              maxLength={20}
            />
          </label>

          <label>
            Room
            <input
              value={roomId}
              onChange={(event) => onRoomIdChange(event.target.value)}
              placeholder="Room code"
              maxLength={50}
            />
          </label>

          {error && <p className="error-banner">{error}</p>}

          <div className="action-row">
            <Button onClick={onCreateRoom} disabled={isLoading}>
              {isLoading ? "Creating..." : "Create"}
            </Button>
            <Button onClick={onJoinRoom} variant="secondary" disabled={isLoading}>
              {isLoading ? "Joining..." : "Join"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen viewport-screen lobby-screen">
      <div className="top-bar glass-panel">
        <div>
          <span className="eyebrow">Lobby</span>
          <h1>Room {room.id}</h1>
        </div>
        <Badge tone={isHost ? "amber" : "muted"}>{isHost ? "Host" : "Guest"}</Badge>
      </div>

      <div className="lobby-grid">
        <div className="glass-panel roster-panel">
          <div className="panel-title">
            <span>Players</span>
            <Badge tone="cyan">{room.players.length}/12</Badge>
          </div>

          <div className="roster-list">
            {room.players.map((player) => (
              <div key={player.id} className="roster-row">
                <div>
                  <strong>{player.name}</strong>
                  {player.id === socket.id && <span>You</span>}
                </div>
                <Badge tone={player.isReady ? "lime" : "muted"}>{player.isReady ? "Ready" : "Waiting"}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel lobby-control-panel">
          <h2>Ready Check</h2>
          <p>{isHost ? "Start once everyone is ready." : "Ready up and wait for the host."}</p>
          {error && <p className="error-banner">{error}</p>}

          <Button onClick={onToggleReady} variant={currentPlayer?.isReady ? "secondary" : "primary"} disabled={isLoading}>
            {currentPlayer?.isReady ? "Unready" : "Ready"}
          </Button>

          {isHost && (
            <Button onClick={onStartGame} disabled={!canStart || isLoading}>
              Start Game
            </Button>
          )}

          <Button onClick={onLeaveRoom} variant="danger" disabled={isLoading}>
            Leave Room
          </Button>
        </div>
      </div>
    </section>
  );
}

export default LobbyScreen;
