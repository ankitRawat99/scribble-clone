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
  /** Server-generated token for reconnect identity. Never sent to other clients. */
  reconnectToken?: string;
}

export enum TurnPhase {
  CHOOSING_WORD = "choosing-word",
  DRAWING = "drawing",
  ROUND_ENDED = "round-ended",
}

export interface Room {
  id: string;
  players: Player[];
  hostId: string; // ID of the host/room creator
  currentDrawerId: string | null; // Active drawing authority
  currentWord: string | null; // Secret word; never broadcast to all clients
  currentWordOptions: string[];
  currentPhase: TurnPhase | null;
  currentTurnIndex: number;
  currentRound: number;
  maxRounds: number;
  turnsThisRound: number; // How many turns completed in the current round
  playersPerRound: number; // Player count locked at round start for stable round tracking
  turnEndsAt: number | null;
  phaseEndsAt: number | null;
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
