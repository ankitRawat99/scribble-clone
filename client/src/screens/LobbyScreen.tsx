import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../socket/socket";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { copyInviteLink } from "../hooks/useInviteLink";
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

/**
 * LobbyScreen — Entry screen + waiting lobby.
 *
 * INVITE URL ROUTING:
 * When a user opens /room/abc123, React Router provides the roomId via useParams.
 * We call onRoomIdChange(roomId) once on mount to pre-fill the room code input.
 * The user only needs to type their name — the room code is already there.
 *
 * This is a pure frontend feature — no server API changes.
 * The URL just carries the roomId string that the join form already accepts.
 */
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
  const { roomId: urlRoomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();

  const isHost = Boolean(room && room.hostId === socket.id);
  const currentPlayer = room?.players.find((p) => p.id === socket.id);
  const allReady = Boolean(room && room.players.length >= 2 && room.players.every((p) => p.isReady));
  const canStart = isHost && allReady;

  // Pre-fill room code from URL param (invite link flow)
  useEffect(() => {
    if (urlRoomId && !room) {
      onRoomIdChange(decodeURIComponent(urlRoomId));
    }
  }, [urlRoomId, room, onRoomIdChange]);

  // Navigate to /room/:roomId when joining a room
  useEffect(() => {
    if (room && window.location.pathname === "/") {
      navigate(`/room/${room.id}`, { replace: true });
    }
  }, [room, navigate]);

  // Navigate back to / when leaving a room
  useEffect(() => {
    if (!room && window.location.pathname !== "/") {
      navigate("/", { replace: true });
    }
  }, [room, navigate]);

  // ── Pre-room: Entry screen ──────────────────────────────────────
  if (!room) {
    return (
      <section className="screen viewport-screen lobby-entry">
        <div className="hero-copy">
          <Badge tone="cyan">Realtime drawing party</Badge>
          <h1>Skribbl Arena</h1>
          <p>Spin up a private room, invite your squad, and draw in sync.</p>

          {urlRoomId && (
            <div className="invite-hint glass-panel">
              <span>🎉</span>
              <span>You were invited to room <strong>{decodeURIComponent(urlRoomId)}</strong></span>
            </div>
          )}
        </div>

        <div className="glass-panel join-panel">
          <label htmlFor="player-name-input">
            Your Name
            <input
              id="player-name-input"
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="Display name"
              maxLength={20}
              autoFocus={Boolean(urlRoomId)}
            />
          </label>

          <label htmlFor="room-id-input">
            Room Code
            <input
              id="room-id-input"
              value={roomId}
              onChange={(e) => onRoomIdChange(e.target.value)}
              placeholder="e.g. skribbl-party"
              maxLength={50}
              autoFocus={!urlRoomId}
            />
          </label>

          {error && <p className="error-banner">{error}</p>}

          <div className="action-row">
            <Button id="create-room-btn" onClick={onCreateRoom} disabled={isLoading}>
              {isLoading ? "Creating…" : "Create Room"}
            </Button>
            <Button id="join-room-btn" onClick={onJoinRoom} variant="secondary" disabled={isLoading}>
              {isLoading ? "Joining…" : urlRoomId ? "Join Invite" : "Join Room"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // ── In-room: Waiting lobby ──────────────────────────────────────
  return (
    <section className="screen viewport-screen lobby-screen">
      <div className="top-bar glass-panel">
        <div>
          <span className="eyebrow">Lobby</span>
          <h1>Room: {room.id}</h1>
        </div>
        <div className="top-bar-actions">
          <Badge tone={isHost ? "amber" : "muted"}>{isHost ? "Host" : "Guest"}</Badge>
          <button
            id="lobby-invite-btn"
            type="button"
            className="invite-btn"
            onClick={() => copyInviteLink(room.id)}
            title="Copy invite link"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Copy Invite
          </button>
        </div>
      </div>

      <div className="lobby-grid">
        {/* Player roster */}
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
                  {player.id === socket.id && <span className="you-badge"> (You)</span>}
                  {player.id === room.hostId && <span className="host-badge"> Host</span>}
                </div>
                <Badge tone={player.isReady ? "lime" : "muted"}>
                  {player.isReady ? "Ready" : "Waiting"}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="glass-panel lobby-control-panel">
          <h2>Ready Check</h2>
          <p>{isHost ? "Start once everyone is ready." : "Ready up and wait for the host."}</p>

          <p className="invite-url-display">
            Invite link:{" "}
            <code>{window.location.origin}/room/{room.id}</code>
          </p>

          {error && <p className="error-banner">{error}</p>}

          <div className="control-stack">
            <Button
              id="toggle-ready-btn"
              onClick={onToggleReady}
              variant={currentPlayer?.isReady ? "secondary" : "primary"}
              disabled={isLoading}
            >
              {currentPlayer?.isReady ? "Unready" : "Ready Up"}
            </Button>

            {isHost && (
              <Button
                id="start-game-btn"
                onClick={onStartGame}
                disabled={!canStart || isLoading}
              >
                {isLoading ? "Starting…" : "Start Game"}
              </Button>
            )}

            <Button
              id="leave-room-btn"
              onClick={onLeaveRoom}
              variant="danger"
              disabled={isLoading}
            >
              Leave Room
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LobbyScreen;
