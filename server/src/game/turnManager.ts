import { GAME_CONSTANTS } from "./game.constants";
import { getRandomWordOptions } from "./wordManager";
import { Room, GameStatus, Player, TurnPhase } from "../types/room.types";

export function getNextDrawer(room: Room): Player | null {
  if (room.players.length === 0) return null;

  const normalizedIndex = room.currentTurnIndex % room.players.length;
  return room.players[normalizedIndex] ?? null;
}

export function resetTurnState(room: Room, maxRounds?: number): Room {
  room.currentTurnIndex = GAME_CONSTANTS.INITIAL_TURN_INDEX;
  room.turnsThisRound = 0;
  room.playersPerRound = room.players.length;
  room.currentRound = GAME_CONSTANTS.STARTING_ROUND;
  room.maxRounds = maxRounds ?? GAME_CONSTANTS.MAX_ROUNDS;
  room.currentDrawerId = null;
  room.currentWord = null;
  room.currentWordOptions = [];
  room.currentPhase = null;
  room.turnEndsAt = null;
  room.phaseEndsAt = null;
  room.guessedPlayerIds = [];

  return room;
}

export function startNextTurn(room: Room): { success: boolean; room?: Room; error?: string } {
  if (room.players.length === 0) {
    return { success: false, error: "Cannot start turn without players" };
  }

  const nextDrawer = getNextDrawer(room);
  if (!nextDrawer) {
    return { success: false, error: "Could not select next drawer" };
  }

  room.status = GameStatus.PLAYING;
  room.currentDrawerId = nextDrawer.id;
  room.currentWord = null;
  room.currentWordOptions = getRandomWordOptions(3);
  room.currentPhase = TurnPhase.CHOOSING_WORD;
  room.turnEndsAt = null;
  room.phaseEndsAt = Date.now() + GAME_CONSTANTS.WORD_SELECTION_SECONDS * 1000;
  room.guessedPlayerIds = [];

  return { success: true, room };
}

export function startDrawingPhase(
  room: Room,
  selectedWord: string
): { success: boolean; room?: Room; error?: string } {
  if (room.currentPhase !== TurnPhase.CHOOSING_WORD) {
    return { success: false, error: "Room is not choosing a word" };
  }

  if (!room.currentWordOptions.includes(selectedWord)) {
    return { success: false, error: "Selected word was not offered" };
  }

  room.currentWord = selectedWord;
  room.currentPhase = TurnPhase.DRAWING;
  room.turnEndsAt = Date.now() + GAME_CONSTANTS.TURN_DURATION_SECONDS * 1000;
  room.phaseEndsAt = room.turnEndsAt;
  room.guessedPlayerIds = [];

  return { success: true, room };
}

export function startRoundEndPhase(room: Room): Room {
  room.currentPhase = TurnPhase.ROUND_ENDED;
  room.currentWordOptions = [];
  room.turnEndsAt = null;
  room.phaseEndsAt = Date.now() + GAME_CONSTANTS.ROUND_END_SECONDS * 1000;

  return room;
}

export function advanceTurn(room: Room): { success: boolean; room?: Room; error?: string } {
  if (room.players.length === 0) {
    return { success: false, error: "Cannot advance turn without players" };
  }

  room.currentTurnIndex += 1;

  // Track turns within the current round using playersPerRound (locked at round/game start)
  // so that mid-game player joins/leaves don't break round advancement.
  const playersPerRound = room.playersPerRound ?? room.players.length;
  room.turnsThisRound = (room.turnsThisRound ?? 0) + 1;

  if (room.turnsThisRound >= playersPerRound) {
    room.currentRound += 1;
    room.turnsThisRound = 0;
    // Lock in the current player count for the next round
    room.playersPerRound = room.players.length;
  }

  if (room.currentRound > room.maxRounds) {
    room.status = GameStatus.FINISHED;
    room.currentDrawerId = null;
    room.currentWord = null;
    room.currentWordOptions = [];
    room.currentPhase = null;
    room.turnEndsAt = null;
    room.phaseEndsAt = null;
    room.guessedPlayerIds = [];

    return { success: true, room };
  }

  return startNextTurn(room);
}
