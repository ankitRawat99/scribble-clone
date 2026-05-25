import { Server, Socket } from "socket.io";
import * as roomManager from "../rooms/roomManager";
import * as gameManager from "../rooms/gameManager";
import * as turnManager from "../game/turnManager";
import { GAME_CONSTANTS } from "../game/game.constants";
import { getHiddenWord } from "../game/wordManager";
import { ChatMessage, GameStatus, Player, Room, TurnPhase } from "../types/room.types";
import { clearRoomCanvasHistory } from "./drawingHandlers";

const phaseTimers = new Map<string, NodeJS.Timeout>();

function createPublicRoomState(room: Room): Room {
  return {
    ...room,
    currentWord: null,
    currentWordOptions: [],
    // Strip reconnectToken from player objects — tokens are private per-player
    players: room.players.map(({ reconnectToken: _token, ...player }) => player as Player),
  };
}

function emitPublicRoomUpdate(io: Server, room: Room): void {
  io.to(room.id).emit("room-updated", createPublicRoomState(room));
}

function emitWordState(io: Server, room: Room): void {
  const hiddenWord = getHiddenWord(room.currentWord);

  room.players.forEach((player) => {
    const isDrawer = player.id === room.currentDrawerId;
    io.to(player.id).emit("word-updated", {
      word: isDrawer ? room.currentWord : hiddenWord,
      isDrawer,
    });
  });
}

function emitWordOptions(io: Server, room: Room): void {
  if (!room.currentDrawerId) return;

  io.to(room.currentDrawerId).emit("word-options", {
    options: room.currentWordOptions,
    remainingSeconds: GAME_CONSTANTS.WORD_SELECTION_SECONDS,
  });
}

function createSystemMessage(roomId: string, message: string, type: ChatMessage["type"] = "system"): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    roomId,
    playerId: null,
    playerName: "System",
    message,
    type,
    createdAt: Date.now(),
  };
}

function emitTurnState(io: Server, room: Room): void {
  const remainingMs = Math.max(0, (room.phaseEndsAt ?? room.turnEndsAt ?? Date.now()) - Date.now());
  io.to(room.id).emit("timer-updated", {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    phase: room.currentPhase,
  });
}

function stopPhaseTimer(roomId: string): void {
  const timer = phaseTimers.get(roomId);
  if (timer) {
    clearInterval(timer);
    phaseTimers.delete(roomId);
  }
}

function endGame(io: Server, room: Room): void {
  stopPhaseTimer(room.id);
  room.status = GameStatus.FINISHED;
  room.currentDrawerId = null;
  room.currentWord = null;
  room.currentWordOptions = [];
  room.currentPhase = null;
  room.turnEndsAt = null;
  room.phaseEndsAt = null;
  room.guessedPlayerIds = [];

  emitPublicRoomUpdate(io, room);
  io.to(room.id).emit("game-finished", createPublicRoomState(room));
  io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Game finished."));
}

function awardDrawerBonus(room: Room): void {
  const drawer = room.players.find((player) => player.id === room.currentDrawerId);
  if (drawer && room.guessedPlayerIds.length > 0) {
    drawer.score += room.guessedPlayerIds.length * GAME_CONSTANTS.DRAWER_BONUS_PER_GUESS;
  }
}

function startChoosingPhase(io: Server, room: Room): void {
  stopPhaseTimer(room.id);
  emitPublicRoomUpdate(io, room);
  emitWordOptions(io, room);
  io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Drawer is choosing a word."));
  emitTurnState(io, room);

  const timer = setInterval(() => {
    const latestRoom = roomManager.getRoom(room.id);
    if (!latestRoom || latestRoom.status !== GameStatus.PLAYING) {
      stopPhaseTimer(room.id);
      return;
    }

    emitTurnState(io, latestRoom);

    if (latestRoom.currentPhase !== TurnPhase.CHOOSING_WORD) return;
    if ((latestRoom.phaseEndsAt ?? 0) > Date.now()) return;

    const fallbackWord = latestRoom.currentWordOptions[0];
    if (!fallbackWord) {
      stopPhaseTimer(room.id);
      return;
    }

    startDrawingRound(io, latestRoom, fallbackWord);
  }, 1000);

  phaseTimers.set(room.id, timer);
}

function startDrawingRound(io: Server, room: Room, selectedWord: string): void {
  stopPhaseTimer(room.id);

  const drawingStart = turnManager.startDrawingPhase(room, selectedWord);
  if (!drawingStart.success || !drawingStart.room) return;

  // Reset canvas history at the start of every drawing round so undo/reconnect
  // sync starts fresh — strokes from the previous turn must not bleed through.
  clearRoomCanvasHistory(room.id);

  emitPublicRoomUpdate(io, drawingStart.room);
  emitWordState(io, drawingStart.room);
  io.to(room.id).emit("clear-canvas");
  io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Drawing round started."));
  emitTurnState(io, drawingStart.room);

  const timer = setInterval(() => {
    const latestRoom = roomManager.getRoom(room.id);
    if (!latestRoom || latestRoom.status !== GameStatus.PLAYING) {
      stopPhaseTimer(room.id);
      return;
    }

    emitTurnState(io, latestRoom);

    if (latestRoom.currentPhase !== TurnPhase.DRAWING) return;
    if ((latestRoom.turnEndsAt ?? 0) > Date.now()) return;

    endRound(io, latestRoom);
  }, 1000);

  phaseTimers.set(room.id, timer);
}

function startNextTurnOrFinish(io: Server, room: Room): void {
  const nextTurn = turnManager.advanceTurn(room);
  if (!nextTurn.success || !nextTurn.room) return;

  if (nextTurn.room.status === GameStatus.FINISHED) {
    endGame(io, nextTurn.room);
    return;
  }

  startChoosingPhase(io, nextTurn.room);
}

function endRound(io: Server, room: Room): void {
  stopPhaseTimer(room.id);
  awardDrawerBonus(room);
  turnManager.startRoundEndPhase(room);
  emitPublicRoomUpdate(io, room);
  io.to(room.id).emit("round-ended", {
    word: room.currentWord,
    guessedPlayerIds: room.guessedPlayerIds,
  });
  io.to(room.id).emit(
    "chat-message",
    createSystemMessage(room.id, `Round ended. The word was ${room.currentWord}.`)
  );
  emitTurnState(io, room);

  const timer = setInterval(() => {
    const latestRoom = roomManager.getRoom(room.id);
    if (!latestRoom || latestRoom.status !== GameStatus.PLAYING) {
      stopPhaseTimer(room.id);
      return;
    }

    emitTurnState(io, latestRoom);

    if ((latestRoom.phaseEndsAt ?? 0) > Date.now()) return;

    stopPhaseTimer(room.id);
    startNextTurnOrFinish(io, latestRoom);
  }, 1000);

  phaseTimers.set(room.id, timer);
}

// ============================================
// SOCKET EVENT HANDLERS
// ============================================

export function registerRoomHandlers(io: Server, socket: Socket): void {

  // ── create-room ──────────────────────────────────────────────
  socket.on(
    "create-room",
    (payload: { roomId: string; playerName: string }, callback?: (response: any) => void) => {
      const { roomId, playerName } = payload;

      const nameValidation = roomManager.validatePlayerName(playerName);
      if (!nameValidation.valid) {
        socket.emit("room-error", { message: nameValidation.error });
        if (callback) callback({ success: false, error: nameValidation.error });
        return;
      }

      const roomIdValidation = roomManager.validateRoomId(roomId);
      if (!roomIdValidation.valid) {
        socket.emit("room-error", { message: roomIdValidation.error });
        if (callback) callback({ success: false, error: roomIdValidation.error });
        return;
      }

      if (roomManager.roomExists(roomId)) {
        socket.emit("room-error", { message: "Room already exists" });
        if (callback) callback({ success: false, error: "Room already exists" });
        return;
      }

      const room = roomManager.createRoom(roomId, socket.id);
      const reconnectToken = roomManager.generateReconnectToken();
      const player: Player = {
        id: socket.id,
        name: playerName.trim(),
        isReady: false,
        score: 0,
        reconnectToken,
      };

      const addResult = roomManager.addPlayerToRoom(roomId, player);
      if (!addResult.success) {
        socket.emit("room-error", { message: addResult.error });
        roomManager.deleteRoom(roomId);
        if (callback) callback({ success: false, error: addResult.error });
        return;
      }

      socket.join(roomId);
      socket.emit("reconnect-token", { reconnectToken });
      emitPublicRoomUpdate(io, addResult.room!);
      if (callback) callback({ success: true, room: createPublicRoomState(addResult.room!) });
      console.log(`Room created: ${roomId}, Host: ${playerName}`);
    }
  );

  // ── join-room ────────────────────────────────────────────────
  socket.on(
    "join-room",
    (payload: { roomId: string; playerName: string }, callback?: (response: any) => void) => {
      const { roomId, playerName } = payload;

      const nameValidation = roomManager.validatePlayerName(playerName);
      if (!nameValidation.valid) {
        socket.emit("room-error", { message: nameValidation.error });
        if (callback) callback({ success: false, error: nameValidation.error });
        return;
      }

      const roomIdValidation = roomManager.validateRoomId(roomId);
      if (!roomIdValidation.valid) {
        socket.emit("room-error", { message: roomIdValidation.error });
        if (callback) callback({ success: false, error: roomIdValidation.error });
        return;
      }

      if (!roomManager.roomExists(roomId)) {
        socket.emit("room-error", { message: `Room "${roomId}" does not exist` });
        if (callback) callback({ success: false, error: `Room "${roomId}" does not exist` });
        return;
      }

      if (roomManager.isPlayerAlreadyInRoom(roomId, socket.id)) {
        socket.emit("room-error", { message: "You are already in this room" });
        if (callback) callback({ success: false, error: "You are already in this room" });
        return;
      }

      const reconnectToken = roomManager.generateReconnectToken();
      const player: Player = {
        id: socket.id,
        name: playerName.trim(),
        isReady: false,
        score: 0,
        reconnectToken,
      };

      const addResult = roomManager.addPlayerToRoom(roomId, player);
      if (!addResult.success) {
        socket.emit("room-error", { message: addResult.error });
        if (callback) callback({ success: false, error: addResult.error });
        return;
      }

      socket.join(roomId);
      socket.emit("reconnect-token", { reconnectToken });
      emitPublicRoomUpdate(io, addResult.room!);
      if (callback) callback({ success: true, room: createPublicRoomState(addResult.room!) });
      console.log(`Player joined: ${playerName} joined room ${roomId}`);
    }
  );

  // ── toggle-ready ─────────────────────────────────────────────
  socket.on("toggle-ready", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    const result = roomManager.togglePlayerReady(room.id, socket.id);
    if (!result.success) {
      socket.emit("room-error", { message: result.error });
      return;
    }

    emitPublicRoomUpdate(io, result.room!);
    const player = result.room!.players.find((p) => p.id === socket.id);
    console.log(`Player ready status: ${player?.name} is now ${player?.isReady ? "ready" : "not ready"}`);
  });

  // ── start-game ───────────────────────────────────────────────
  socket.on("start-game", (payload?: { maxRounds?: number }) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    if (!roomManager.isPlayerHost(room.id, socket.id)) {
      socket.emit("room-error", { message: "Only the host can start the game" });
      return;
    }

    const gameValidation = gameManager.validateGameStart(room);
    if (!gameValidation.valid) {
      socket.emit("room-error", { message: gameValidation.error });
      return;
    }

    const gameInit = gameManager.initializeGame(room);
    if (!gameInit.success) {
      socket.emit("room-error", { message: gameInit.error });
      return;
    }

    const gameStart = roomManager.startGame(room.id);
    if (!gameStart.success || !gameStart.room) {
      socket.emit("room-error", { message: gameStart.error });
      return;
    }

    // Validate and apply host-selected round count (2–10), default 3
    const rawRounds = payload?.maxRounds;
    const maxRounds =
      typeof rawRounds === "number" && Number.isInteger(rawRounds) && rawRounds >= 2 && rawRounds <= 10
        ? rawRounds
        : GAME_CONSTANTS.MAX_ROUNDS;

    turnManager.resetTurnState(gameStart.room, maxRounds);
    const turnStart = turnManager.startNextTurn(gameStart.room);
    if (!turnStart.success || !turnStart.room) {
      socket.emit("room-error", { message: turnStart.error });
      return;
    }

    io.to(room.id).emit("game-started", createPublicRoomState(turnStart.room));
    io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Game started."));
    startChoosingPhase(io, turnStart.room);
    console.log(`Game started in room ${room.id} with ${maxRounds} rounds`);
  });

  // ── select-word ──────────────────────────────────────────────
  socket.on("select-word", (payload: { roomId: string; selectedWord: string }) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== payload?.roomId) {
      socket.emit("room-error", { message: "Not in this room" });
      return;
    }

    if (room.currentDrawerId !== socket.id) {
      socket.emit("room-error", { message: "Only the current drawer can select a word" });
      return;
    }

    if (room.currentPhase !== TurnPhase.CHOOSING_WORD) {
      socket.emit("room-error", { message: "Word selection is not active" });
      return;
    }

    if (!room.currentWordOptions.includes(payload.selectedWord)) {
      socket.emit("room-error", { message: "Selected word was not offered" });
      return;
    }

    startDrawingRound(io, room, payload.selectedWord);
  });

  // ── next-turn (manual, host only) ────────────────────────────
  socket.on("next-turn", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    if (room.currentPhase !== TurnPhase.DRAWING) {
      socket.emit("room-error", { message: "Guesses are only open while drawing" });
      return;
    }

    if (!roomManager.isPlayerHost(room.id, socket.id)) {
      socket.emit("room-error", { message: "Only the host can advance turns" });
      return;
    }

    if (room.currentPhase === TurnPhase.DRAWING) {
      endRound(io, room);
      return;
    }

    startNextTurnOrFinish(io, room);
    console.log(`Next turn started in room ${room.id}`);
  });

  // ── submit-guess ─────────────────────────────────────────────
  socket.on("submit-guess", (payload: { guess: string }) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    if (room.currentDrawerId === socket.id) {
      socket.emit("room-error", { message: "Drawer cannot submit guesses" });
      return;
    }

    if (typeof payload?.guess !== "string" || payload.guess.trim().length === 0) {
      socket.emit("room-error", { message: "Guess cannot be empty" });
      return;
    }

    const guess = payload.guess.trim();
    const player = room.players.find((roomPlayer) => roomPlayer.id === socket.id);
    if (!player) {
      socket.emit("room-error", { message: "Player not in room" });
      return;
    }

    if (room.guessedPlayerIds.includes(socket.id)) {
      socket.emit("room-error", { message: "You already guessed this word" });
      return;
    }

    if (room.currentWord && guess.toLowerCase() === room.currentWord.toLowerCase()) {
      room.guessedPlayerIds.push(socket.id);
      const guessRank = room.guessedPlayerIds.length - 1;
      const points = Math.max(
        GAME_CONSTANTS.MIN_GUESS_POINTS,
        GAME_CONSTANTS.CORRECT_GUESS_POINTS - guessRank * GAME_CONSTANTS.GUESS_POINT_STEP
      );
      player.score += points;

      io.to(room.id).emit("correct-guess", { playerId: socket.id, playerName: player.name, points });
      io.to(room.id).emit(
        "chat-message",
        createSystemMessage(room.id, `${player.name} guessed correctly.`, "correct")
      );
      emitPublicRoomUpdate(io, room);

      const guessers = room.players.filter((roomPlayer) => roomPlayer.id !== room.currentDrawerId);
      if (guessers.length > 0 && room.guessedPlayerIds.length >= guessers.length) {
        endRound(io, room);
      }
      return;
    }

    io.to(room.id).emit("chat-message", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      roomId: room.id,
      playerId: socket.id,
      playerName: player.name,
      message: guess,
      type: "guess",
      createdAt: Date.now(),
    } satisfies ChatMessage);
  });

  // ── leave-room ───────────────────────────────────────────────
  // Voluntary leave = NO grace period (player chose to leave).
  socket.on("leave-room", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    const roomId = room.id;
    const wasDrawer = room.currentDrawerId === socket.id;
    const wasPlaying = room.status === GameStatus.PLAYING;

    const updatedRoom = roomManager.removePlayerFromRoom(roomId, socket.id);
    socket.leave(roomId);
    socket.emit("room-left", { roomId });

    if (!updatedRoom) {
      stopPhaseTimer(roomId);
      console.log(`Player left room ${roomId}. Room deleted (empty).`);
      return;
    }

    if (wasPlaying && updatedRoom.players.length < 2) {
      io.to(roomId).emit("chat-message", createSystemMessage(roomId, "Not enough players. Game ending."));
      endGame(io, updatedRoom);
      return;
    }

    if (wasPlaying && wasDrawer) {
      io.to(roomId).emit("chat-message", createSystemMessage(roomId, "Drawer left. Skipping turn..."));
      endRound(io, updatedRoom);
    } else {
      emitPublicRoomUpdate(io, updatedRoom);
    }

    console.log(`Player voluntarily left room ${roomId}.`);
  });

  // ── rejoin-room (BUG 6 FIX — Reconnect) ─────────────────────
  //
  // ARCHITECTURE:
  // Socket.IO assigns a NEW socket.id on every reconnection.
  // Without a reconnect system, any network blip permanently kicks the player.
  //
  // FLOW:
  // 1. On initial join, server generates a reconnectToken → sends to client
  // 2. Client stores it in sessionStorage
  // 3. On disconnect, server creates a grace record (5 seconds)
  // 4. When client's socket reconnects, client sends rejoin-room { reconnectToken }
  // 5. Server matches token → restores player with new socket.id
  // 6. If the player was the drawer, their turn resumes
  socket.on("rejoin-room", (payload: { reconnectToken: string }) => {
    const token = payload?.reconnectToken;
    if (typeof token !== "string" || token.length === 0) {
      socket.emit("rejoin-failed", { message: "Invalid reconnect token" });
      return;
    }

    const graceRecord = roomManager.getGraceRecord(token);
    if (!graceRecord) {
      socket.emit("rejoin-failed", { message: "No active session found. Please rejoin manually." });
      return;
    }

    const room = roomManager.getRoom(graceRecord.roomId);
    if (!room) {
      roomManager.removeGraceRecord(token);
      socket.emit("rejoin-failed", { message: "Room no longer exists." });
      return;
    }

    // Cancel the grace timeout — player is back!
    roomManager.removeGraceRecord(token);

    // Restore the player with their new socket.id but old state (name, score, etc.)
    const restoredPlayer: Player = {
      ...graceRecord.player,
      id: socket.id,
      reconnectToken: token,
    };

    // Add player back to room and update socket mapping
    const addResult = roomManager.addPlayerToRoom(graceRecord.roomId, restoredPlayer);
    if (!addResult.success) {
      // Fallback: push directly if addPlayerToRoom rejects (e.g. capacity check during restore)
      room.players.push(restoredPlayer);
    }

    socket.join(graceRecord.roomId);

    // If this player was the drawer, restore drawer status
    if (graceRecord.wasDrawer) {
      room.currentDrawerId = socket.id;
    }

    socket.emit("rejoin-success", {
      reconnectToken: token,
      room: createPublicRoomState(room),
    });

    emitPublicRoomUpdate(io, room);

    if (room.status === GameStatus.PLAYING) {
      emitWordState(io, room);
      emitTurnState(io, room);

      if (graceRecord.wasDrawer && room.currentPhase === TurnPhase.CHOOSING_WORD) {
        emitWordOptions(io, room);
      }
    }

    io.to(room.id).emit("chat-message",
      createSystemMessage(room.id, `${restoredPlayer.name} reconnected.`)
    );

    console.log(`Player ${restoredPlayer.name} reconnected to room ${room.id}`);
  });

  // ── disconnect (BUG 5 + 6 FIX) ──────────────────────────────
  //
  // PREVIOUS BEHAVIOR (broken):
  //   removePlayerBySocketId(socket.id) → silently reassigns currentDrawerId
  //   to players[0] without stopping timers or advancing the turn. Game stalls.
  //
  // NEW BEHAVIOR:
  // 1. If player has reconnectToken + game is active → start grace period
  // 2. During grace period: player is temporarily removed but can rejoin
  // 3. Grace period expires → permanently remove + advance turn if was drawer
  // 4. If <2 players remain during a game → end the game
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const roomId = room.id;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const wasDrawer = room.currentDrawerId === socket.id;
    const wasPlaying = room.status === GameStatus.PLAYING;
    const token = player.reconnectToken;

    // Grace period path: player has token + game is active
    if (token && wasPlaying) {
      const playerSnapshot: Player = { ...player };

      // Temporarily remove from room's player list
      room.players = room.players.filter((p) => p.id !== socket.id);
      roomManager.removeSocketMapping(socket.id);

      if (room.players.length === 0) {
        roomManager.deleteRoom(roomId);
        stopPhaseTimer(roomId);
        console.log(`Last player disconnected from room ${roomId}. Room deleted.`);
        return;
      }

      // Transfer host if needed
      if (room.hostId === socket.id && room.players.length > 0) {
        room.hostId = room.players[0]!.id;
      }

      io.to(roomId).emit("chat-message",
        createSystemMessage(roomId, `${player.name} lost connection. Waiting ${roomManager.getGracePeriodMs() / 1000}s...`)
      );
      emitPublicRoomUpdate(io, room);

      const graceTimer = setTimeout(() => {
        roomManager.removeGraceRecord(token);

        const latestRoom = roomManager.getRoom(roomId);
        if (!latestRoom) return;

        io.to(roomId).emit("chat-message",
          createSystemMessage(roomId, `${playerSnapshot.name} did not reconnect. Removed.`)
        );

        if (latestRoom.players.length < 2) {
          io.to(roomId).emit("chat-message",
            createSystemMessage(roomId, "Not enough players. Game ending.")
          );
          endGame(io, latestRoom);
          return;
        }

        if (wasDrawer && latestRoom.status === GameStatus.PLAYING) {
          latestRoom.currentDrawerId = null;
          endRound(io, latestRoom);
        } else {
          emitPublicRoomUpdate(io, latestRoom);
        }
      }, roomManager.getGracePeriodMs());

      roomManager.addGraceRecord(token, playerSnapshot, roomId, socket.id, wasDrawer, graceTimer);
      console.log(`Player ${player.name} disconnected from room ${roomId}. Grace period started.`);
      return;
    }

    // Immediate removal path (no token or game not playing)
    const updatedRoom = roomManager.removePlayerFromRoom(roomId, socket.id);

    if (!updatedRoom) {
      stopPhaseTimer(roomId);
      console.log(`Player disconnected from room ${roomId}. Room deleted (empty).`);
      return;
    }

    if (wasPlaying && updatedRoom.players.length < 2) {
      io.to(roomId).emit("chat-message", createSystemMessage(roomId, "Not enough players. Game ending."));
      endGame(io, updatedRoom);
      return;
    }

    if (wasPlaying && wasDrawer) {
      io.to(roomId).emit("chat-message", createSystemMessage(roomId, "Drawer disconnected. Skipping turn..."));
      endRound(io, updatedRoom);
    } else {
      emitPublicRoomUpdate(io, updatedRoom);
    }

    console.log(`Player disconnected from room ${roomId}.`);
  });
}
