import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import ToastContainer from "./components/ui/Toast";
import type { ChatMessage, Room, WordOptionsState, WordState } from "./game/game.types";
import GameScreen from "./game/GameScreen";
import ResultScreen from "./screens/ResultScreen";
import LobbyScreen from "./screens/LobbyScreen";
import { socket } from "./socket/socket";
import { initReconnectSystem, clearReconnectToken } from "./socket/reconnect";
import "./App.css";

type Screen = "lobby" | "playing" | "finished";

/**
 * App — Root component with React Router integration.
 *
 * ROUTING ARCHITECTURE:
 * Two routes are declared:
 *   /          → LobbyScreen (entry form)
 *   /room/:roomId → LobbyScreen (pre-filled join form via useParams)
 *
 * The game screen (/playing) and result screen (/finished) are NOT separate routes.
 * They are screen-state transitions, not URL navigations. Why?
 * - Game state is ephemeral and socket-driven; URLs would become stale on refresh
 * - Players in-game shouldn't be able to "navigate back" via browser history
 * - The room ID in the URL serves the invite purpose, not game-state bookmarking
 *
 * LobbyScreen handles its own navigate() calls to update the URL as the user
 * joins/leaves rooms. App.tsx drives the screen state from socket events.
 */
function App() {
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRounds, setSelectedRounds] = useState(3);
  const [connectionStatus, setConnectionStatus] = useState(
    socket.connected ? "Online" : "Connecting"
  );
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wordState, setWordState] = useState<WordState>({ word: null, isDrawer: false });
  const [wordOptions, setWordOptions] = useState<WordOptionsState>({ options: [], remainingSeconds: 0 });
  const [revealedWord, setRevealedWord] = useState<string | null>(null);

  const isHost = Boolean(room && room.hostId === socket.id);

  useEffect(() => {
    const handleConnect = () => {
      setConnectionStatus("Online");
      setError("");
    };

    const handleDisconnect = () => {
      setConnectionStatus("Reconnecting");
    };

    const handleRoomUpdated = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setError("");
      setIsLoading(false);
      setScreen(
        updatedRoom.status === "finished"
          ? "finished"
          : updatedRoom.status === "playing"
          ? "playing"
          : "lobby"
      );
    };

    const handleGameStarted = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setMessages([]);
      setWordOptions({ options: [], remainingSeconds: 0 });
      setRevealedWord(null);
      setScreen("playing");
      setError("");
      setIsLoading(false);
    };

    const handleGameFinished = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setWordState({ word: null, isDrawer: false });
      setWordOptions({ options: [], remainingSeconds: 0 });
      setRevealedWord(null);
      setScreen("finished");
    };

    const handleRoomLeft = () => {
      setRoom(null);
      setScreen("lobby");
      setMessages([]);
      setWordState({ word: null, isDrawer: false });
      setWordOptions({ options: [], remainingSeconds: 0 });
      setRevealedWord(null);
      setError("");
      setIsLoading(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect_attempt", () => setConnectionStatus("Reconnecting"));
    socket.on("room-updated", handleRoomUpdated);
    socket.on("game-started", handleGameStarted);
    socket.on("game-finished", handleGameFinished);
    socket.on("room-left", handleRoomLeft);
    socket.on("word-updated", setWordState);
    socket.on("word-options", (optionsState: WordOptionsState) => {
      setWordOptions(optionsState);
      setRevealedWord(null);
    });
    socket.on("round-ended", ({ word }: { word: string | null }) => {
      setRevealedWord(word);
      setWordOptions({ options: [], remainingSeconds: 0 });
      setWordState({ word, isDrawer: false });
    });
    socket.on("timer-updated", ({ remainingSeconds: s }: { remainingSeconds: number }) => {
      setRemainingSeconds(s);
    });
    socket.on("chat-message", (message: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-60), message]);
    });
    socket.on("room-error", ({ message }: { message: string }) => {
      setError(message);
      setIsLoading(false);
    });

    // Initialize reconnect system — auto-rejoins on socket reconnect if token exists
    const cleanupReconnect = initReconnectSystem(
      // On rejoin success: restore room state from server
      (data) => {
        setRoom(data.room);
        setError("");
        setIsLoading(false);
        setScreen(
          data.room.status === "finished"
            ? "finished"
            : data.room.status === "playing"
            ? "playing"
            : "lobby"
        );
      },
      // On rejoin failed: go back to lobby
      (data) => {
        setRoom(null);
        setScreen("lobby");
        setError(data.message);
      }
    );

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect_attempt");
      socket.off("room-updated", handleRoomUpdated);
      socket.off("game-started", handleGameStarted);
      socket.off("game-finished", handleGameFinished);
      socket.off("room-left", handleRoomLeft);
      socket.off("word-updated", setWordState);
      socket.off("word-options");
      socket.off("round-ended");
      socket.off("timer-updated");
      socket.off("chat-message");
      socket.off("room-error");
      cleanupReconnect();
    };
  }, []);

  const handleCreateRoom = () => {
    if (!playerName.trim()) { setError("Enter a display name."); return; }
    if (!roomId.trim()) { setError("Enter a room code."); return; }
    setIsLoading(true);
    setError("");
    socket.emit("create-room", { roomId: roomId.trim(), playerName: playerName.trim() });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) { setError("Enter a display name."); return; }
    if (!roomId.trim()) { setError("Enter a room code."); return; }
    setIsLoading(true);
    setError("");
    socket.emit("join-room", { roomId: roomId.trim(), playerName: playerName.trim() });
  };

  const handleToggleReady = () => socket.emit("toggle-ready");
  const handleStartGame = () => { setIsLoading(true); socket.emit("start-game", { maxRounds: selectedRounds }); };
  const handleLeaveRoom = () => { setIsLoading(true); clearReconnectToken(); socket.emit("leave-room"); };
  const handleSubmitGuess = (guess: string) => {
    if (!room) return;
    socket.emit("submit-guess", { roomId: room.id, guess });
  };
  const handleSelectWord = (selectedWord: string) => {
    if (!room) return;
    socket.emit("select-word", { roomId: room.id, selectedWord });
  };

  const lobbyProps = {
    room,
    playerName,
    roomId,
    error,
    isLoading,
    selectedRounds,
    onPlayerNameChange: setPlayerName,
    onRoomIdChange: setRoomId,
    onRoundsChange: setSelectedRounds,
    onCreateRoom: handleCreateRoom,
    onJoinRoom: handleJoinRoom,
    onToggleReady: handleToggleReady,
    onStartGame: handleStartGame,
    onLeaveRoom: handleLeaveRoom,
  };

  return (
    <AppShell connectionStatus={connectionStatus}>
      <ToastContainer />

      {screen === "playing" && room ? (
        <GameScreen
          room={room}
          isHost={isHost}
          wordState={wordState}
          wordOptions={wordOptions}
          revealedWord={revealedWord}
          messages={messages}
          remainingSeconds={remainingSeconds}
          onLeaveRoom={handleLeaveRoom}
          onSubmitGuess={handleSubmitGuess}
          onSelectWord={handleSelectWord}
        />
      ) : screen === "finished" && room ? (
        <ResultScreen room={room} onPlayAgain={handleLeaveRoom} />
      ) : (
        <Routes>
          <Route path="/" element={<LobbyScreen {...lobbyProps} />} />
          <Route path="/room/:roomId" element={<LobbyScreen {...lobbyProps} />} />
          {/* Catch-all: redirect unknown paths to lobby */}
          <Route path="*" element={<LobbyScreen {...lobbyProps} />} />
        </Routes>
      )}
    </AppShell>
  );
}

export default App;
