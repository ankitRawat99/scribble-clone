export type GameStatus = "waiting" | "starting" | "playing" | "finished";
export type TurnPhase = "choosing-word" | "drawing" | "round-ended" | null;

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
  currentWordOptions: string[];
  currentPhase: TurnPhase;
  currentTurnIndex: number;
  currentRound: number;
  maxRounds: number;
  turnEndsAt: number | null;
  phaseEndsAt: number | null;
  guessedPlayerIds: string[];
  status: GameStatus;
  createdAt: number;
}

export interface WordState {
  word: string | null;
  isDrawer: boolean;
}

export interface WordOptionsState {
  options: string[];
  remainingSeconds: number;
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
