import { useEffect, useState } from "react";
import AppShell from "./components/layout/AppShell";
import type { ChatMessage, Room, WordOptionsState, WordState } from "./game/game.types";
import GameScreen from "./game/GameScreen";
import ResultScreen from "./screens/ResultScreen";
import LobbyScreen from "./screens/LobbyScreen";
import { socket } from "./socket/socket";
import "./App.css";

type Screen = "lobby" | "playing" | "finished";

function App() {
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(socket.connected ? "Online" : "Connecting");
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
      setScreen(updatedRoom.status === "finished" ? "finished" : updatedRoom.status === "playing" ? "playing" : "lobby");
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
    socket.on("timer-updated", ({ remainingSeconds: seconds }: { remainingSeconds: number }) => {
      setRemainingSeconds(seconds);
    });
    socket.on("chat-message", (message: ChatMessage) => {
      setMessages((currentMessages) => [...currentMessages.slice(-60), message]);
    });
    socket.on("room-error", ({ message }: { message: string }) => {
      setError(message);
      setIsLoading(false);
    });

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
    };
  }, []);

  const validateJoinForm = () => {
    if (!playerName.trim()) {
      setError("Enter a display name.");
      return false;
    }

    if (!roomId.trim()) {
      setError("Enter a room code.");
      return false;
    }

    return true;
  };

  const handleCreateRoom = () => {
    if (!validateJoinForm()) return;
    setIsLoading(true);
    setError("");
    socket.emit("create-room", { roomId: roomId.trim(), playerName: playerName.trim() });
  };

  const handleJoinRoom = () => {
    if (!validateJoinForm()) return;
    setIsLoading(true);
    setError("");
    socket.emit("join-room", { roomId: roomId.trim(), playerName: playerName.trim() });
  };

  const handleToggleReady = () => {
    socket.emit("toggle-ready");
  };

  const handleStartGame = () => {
    setIsLoading(true);
    socket.emit("start-game");
  };

  const handleLeaveRoom = () => {
    setIsLoading(true);
    socket.emit("leave-room");
  };

  const handleSubmitGuess = (guess: string) => {
    if (!room) return;
    socket.emit("submit-guess", { roomId: room.id, guess });
  };

  const handleSelectWord = (selectedWord: string) => {
    if (!room) return;
    socket.emit("select-word", { roomId: room.id, selectedWord });
  };

  return (
    <AppShell connectionStatus={connectionStatus}>
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
        <LobbyScreen
          room={room}
          playerName={playerName}
          roomId={roomId}
          error={error}
          isLoading={isLoading}
          onPlayerNameChange={setPlayerName}
          onRoomIdChange={setRoomId}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onToggleReady={handleToggleReady}
          onStartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </AppShell>
  );
}

export default App;
