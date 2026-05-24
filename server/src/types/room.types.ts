// Game status states
export enum GameStatus {
  WAITING = "waiting",
  STARTING = "starting",
  PLAYING = "playing",
  FINISHED = "finished",
}

export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  score: number;
}

export interface Room {
  id: string;
  players: Player[];
  hostId: string; // ID of the host/room creator
  currentDrawerId: string | null; // Active drawing authority
  currentWord: string | null; // Secret word; never broadcast to all clients
  currentTurnIndex: number;
  currentRound: number;
  maxRounds: number;
  turnEndsAt: number | null;
  guessedPlayerIds: string[];
  status: GameStatus; // Game state: waiting, starting, playing, finished
  createdAt: number; // Timestamp for debugging
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string | null;
  playerName: string;
  message: string;
  type: "guess" | "system" | "correct";
  createdAt: number;
}
