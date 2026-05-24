import Canvas from "../canvas/Canvas";
import ChatPanel from "../components/chat/ChatPanel";
import Button from "../components/ui/Button";
import Timer from "../components/ui/Timer";
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
  const currentDrawer = room.players.find((player) => player.id === room.currentDrawerId);
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
      <div className="top-bar glass-panel">
        <div>
          <span className="eyebrow">Live match</span>
          <h1>Skribbl Arena</h1>
        </div>
        <div className="top-bar-actions">
          <Timer remainingSeconds={remainingSeconds} />
          <span className="round-pill">
            Round {room.currentRound}/{room.maxRounds}
          </span>
        </div>
      </div>

      <div className="game-board">
        <aside className="side-stack">
          <PlayerSidebar room={room} />
          <ChatPanel messages={messages} canGuess={canGuess} onSubmitGuess={onSubmitGuess} />
        </aside>

        <main className="glass-panel canvas-stage">
          <div className="stage-header">
            <div>
              <h2>Room: {room.id}</h2>
              <p className="turn-meta">
                Turn {room.currentTurnIndex + 1} · Drawer: {currentDrawer?.name || "Pending"}
              </p>
            </div>
            {isHost && (
              <Button type="button" variant="ghost" onClick={handleNextTurn}>
                Next Turn
              </Button>
            )}
          </div>

          {room.currentPhase === "choosing-word" && (
            <WordSelection
              room={room}
              wordOptions={wordOptions}
              remainingSeconds={remainingSeconds}
              isDrawer={isDrawer}
              onSelectWord={onSelectWord}
            />
          )}

          {room.currentPhase === "round-ended" && <RoundReveal revealedWord={revealedWord} />}

          {room.currentPhase === "drawing" && <WordDisplay wordState={wordState} />}

          <Canvas
            roomId={room.id}
            roomStatus={room.status}
            currentDrawerId={room.currentPhase === "drawing" ? room.currentDrawerId : null}
          />

          <div className="game-actions">
            <Button type="button" variant="danger" onClick={onLeaveRoom}>
              Leave Room
            </Button>
          </div>
        </main>
      </div>
    </section>
  );
}

export default GameScreen;
