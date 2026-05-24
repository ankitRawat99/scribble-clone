export type GameStatus = "waiting" | "starting" | "playing" | "finished";

export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  score: number;
}

export interface Room {
  id: string;
  players: Player[];
  hostId: string;
  currentDrawerId: string | null;
  currentWord: string | null;
  currentTurnIndex: number;
  currentRound: number;
  maxRounds: number;
  turnEndsAt: number | null;
  guessedPlayerIds: string[];
  status: GameStatus;
  createdAt: number;
}

export interface WordState {
  word: string | null;
  isDrawer: boolean;
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
