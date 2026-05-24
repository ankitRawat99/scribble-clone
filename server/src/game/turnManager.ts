import { GAME_CONSTANTS } from "./game.constants";
import { getRandomWord } from "./wordManager";
import { Room, GameStatus, Player } from "../types/room.types";

export function getNextDrawer(room: Room): Player | null {
  if (room.players.length === 0) return null;

  const normalizedIndex = room.currentTurnIndex % room.players.length;
  return room.players[normalizedIndex] ?? null;
}

export function resetTurnState(room: Room): Room {
  room.currentTurnIndex = GAME_CONSTANTS.INITIAL_TURN_INDEX;
  room.currentRound = GAME_CONSTANTS.STARTING_ROUND;
  room.maxRounds = GAME_CONSTANTS.MAX_ROUNDS;
  room.currentDrawerId = null;
  room.currentWord = null;
  room.turnEndsAt = null;
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
  room.currentWord = getRandomWord();
  room.turnEndsAt = Date.now() + GAME_CONSTANTS.TURN_DURATION_SECONDS * 1000;
  room.guessedPlayerIds = [];

  return { success: true, room };
}

export function advanceTurn(room: Room): { success: boolean; room?: Room; error?: string } {
  if (room.players.length === 0) {
    return { success: false, error: "Cannot advance turn without players" };
  }

  room.currentTurnIndex += 1;

  if (room.currentTurnIndex > 0 && room.currentTurnIndex % room.players.length === 0) {
    room.currentRound += 1;
  }

  if (room.currentRound > room.maxRounds) {
    room.status = GameStatus.FINISHED;
    room.currentDrawerId = null;
    room.currentWord = null;
    room.turnEndsAt = null;
    room.guessedPlayerIds = [];

    return { success: true, room };
  }

  return startNextTurn(room);
}
