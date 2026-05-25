import Canvas from "../canvas/Canvas";
import ChatPanel from "../components/chat/ChatPanel";
import Button from "../components/ui/Button";
import Timer from "../components/ui/Timer";
import { copyInviteLink } from "../hooks/useInviteLink";
import { socket } from "../socket/socket";
import PlayerSidebar from "./PlayerSidebar";
import RoundReveal from "./RoundReveal";
import WordDisplay from "./WordDisplay";
import WordSelection from "./WordSelection";
import type { ChatMessage, Room, WordOptionsState, WordState } from "./game.types";

interface GameScreenProps {
  room: Room;
  isHost: boolean;
  wordState: WordState;
  wordOptions: WordOptionsState;
  revealedWord: string | null;
  messages: ChatMessage[];
  remainingSeconds: number;
  onLeaveRoom: () => void;
  onSubmitGuess: (guess: string) => void;
  onSelectWord: (word: string) => void;
}

/**
 * GameScreen — The main gameplay layout.
 *
 * LAYOUT REASONING (70/30 split):
 * The canvas is the primary interaction surface in a drawing game. Previous layout
 * gave ~55% to canvas, ~45% to sidebars — limiting the drawing area significantly.
 * New layout: canvas takes `minmax(0, 1fr)` (left), right panel is `clamp(280px, 28vw, 360px)`.
 * This gives ~70-75% to the canvas on typical desktop screens while keeping
 * all multiplayer panels visible without scrolling.
 *
 * CSS Grid is used (not Flexbox) because we need two independent height-fill columns
 * with the right panel itself being a flex-column (Players + Chat stacked).
 * minmax(0, 1fr) is critical — without minmax(0), the canvas column can overflow.
 *
 * VIEWPORT: Everything uses dvh (dynamic viewport height) to account for mobile
 * browser chrome (address bar appearing/disappearing). No full-page scroll.
 * Only internal panel overflow: auto for the chat list and player list.
 */
function GameScreen({
  room,
  isHost,
  wordState,
  wordOptions,
  revealedWord,
  messages,
  remainingSeconds,
  onLeaveRoom,
  onSubmitGuess,
  onSelectWord,
}: GameScreenProps) {
  const currentDrawer = room.players.find((p) => p.id === room.currentDrawerId);
  const isDrawer = room.currentDrawerId === socket.id;
  const canGuess =
    room.status === "playing" &&
    room.currentPhase === "drawing" &&
    !isDrawer &&
    !room.guessedPlayerIds.includes(socket.id || "");

  const handleNextTurn = () => {
    if (!isHost) return;
    socket.emit("next-turn");
  };

  return (
    <section className="screen viewport-screen game-screen">

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="top-bar glass-panel">
        <div className="top-bar-left">
          <span className="eyebrow">Live match</span>
          <h1>Skribbl Arena</h1>
        </div>

        <div className="top-bar-center">
          {room.currentPhase === "drawing" && (
            <WordDisplay wordState={wordState} />
          )}
        </div>

        <div className="top-bar-right top-bar-actions">
          <Timer remainingSeconds={remainingSeconds} />
          <span className="round-pill">Round {room.currentRound}/{room.maxRounds}</span>
          {isHost && (
            <Button type="button" variant="ghost" onClick={handleNextTurn}>
              Skip
            </Button>
          )}
          <Button type="button" variant="danger" onClick={onLeaveRoom}>
            Leave
          </Button>
        </div>
      </header>

      {/* ── Game Board (70 / 30) ─────────────────────────────────── */}
      <div className="game-board">

        {/* ── Left: Big Canvas Column ─────────────────────────── */}
        <main className="canvas-column glass-panel">

          {/* Canvas stage header */}
          <div className="stage-header">
            <div className="stage-meta">
              <h2>Room: {room.id}</h2>
              <p className="turn-meta">
                Turn {room.currentTurnIndex + 1} ·{" "}
                {currentDrawer
                  ? isDrawer
                    ? "You are drawing"
                    : `${currentDrawer.name} is drawing`
                  : "Waiting…"}
              </p>
            </div>
            <button
              id="copy-invite-btn"
              type="button"
              className="invite-btn"
              onClick={() => copyInviteLink(room.id)}
              title="Copy invite link"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Invite
            </button>
          </div>

          {/* Phase overlays — sit above canvas */}
          {room.currentPhase === "choosing-word" && (
            <WordSelection
              room={room}
              wordOptions={wordOptions}
              remainingSeconds={remainingSeconds}
              isDrawer={isDrawer}
              onSelectWord={onSelectWord}
            />
          )}

          {room.currentPhase === "round-ended" && (
            <RoundReveal revealedWord={revealedWord} />
          )}

          {/* The canvas itself — fills remaining space */}
          <Canvas
            roomId={room.id}
            roomStatus={room.status}
            currentDrawerId={room.currentPhase === "drawing" ? room.currentDrawerId : null}
          />
        </main>

        {/* ── Right: Multiplayer Panels ────────────────────────── */}
        <aside className="right-panel">
          <PlayerSidebar room={room} />
          <ChatPanel
            messages={messages}
            canGuess={canGuess}
            onSubmitGuess={onSubmitGuess}
          />
        </aside>
      </div>
    </section>
  );
}

export default GameScreen;
