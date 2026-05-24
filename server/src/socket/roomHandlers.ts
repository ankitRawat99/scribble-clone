import { Server, Socket } from "socket.io";
import * as roomManager from "../rooms/roomManager";
import * as gameManager from "../rooms/gameManager";
import * as turnManager from "../game/turnManager";
import { GAME_CONSTANTS } from "../game/game.constants";
import { getHiddenWord } from "../game/wordManager";
import { ChatMessage, GameStatus, Player, Room } from "../types/room.types";

const turnTimers = new Map<string, NodeJS.Timeout>();

function createPublicRoomState(room: Room): Room {
  return {
    ...room,
    currentWord: null,
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
  const remainingMs = Math.max(0, (room.turnEndsAt ?? Date.now()) - Date.now());
  io.to(room.id).emit("timer-updated", {
    remainingSeconds: Math.ceil(remainingMs / 1000),
  });
}

function stopTurnTimer(roomId: string): void {
  const timer = turnTimers.get(roomId);
  if (timer) {
    clearInterval(timer);
    turnTimers.delete(roomId);
  }
}

function endGame(io: Server, room: Room): void {
  stopTurnTimer(room.id);
  room.status = GameStatus.FINISHED;
  room.currentDrawerId = null;
  room.currentWord = null;
  room.turnEndsAt = null;
  room.guessedPlayerIds = [];

  emitPublicRoomUpdate(io, room);
  io.to(room.id).emit("game-finished", createPublicRoomState(room));
  io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Game finished."));
}

function startTurnTimer(io: Server, roomId: string): void {
  stopTurnTimer(roomId);
  emitTurnState(io, roomManager.getRoom(roomId)!);

  const timer = setInterval(() => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.status !== GameStatus.PLAYING) {
      stopTurnTimer(roomId);
      return;
    }

    emitTurnState(io, room);

    if ((room.turnEndsAt ?? 0) > Date.now()) return;

    const drawer = room.players.find((player) => player.id === room.currentDrawerId);
    if (drawer && room.guessedPlayerIds.length > 0) {
      drawer.score += GAME_CONSTANTS.DRAWER_BONUS_POINTS;
    }

    const nextTurn = turnManager.advanceTurn(room);
    if (!nextTurn.success || !nextTurn.room) {
      stopTurnTimer(roomId);
      return;
    }

    if (nextTurn.room.status === GameStatus.FINISHED) {
      endGame(io, nextTurn.room);
      return;
    }

    emitPublicRoomUpdate(io, nextTurn.room);
    emitWordState(io, nextTurn.room);
    io.to(roomId).emit("clear-canvas");
    io.to(roomId).emit("chat-message", createSystemMessage(roomId, "Next turn started."));
    startTurnTimer(io, roomId);
  }, 1000);

  turnTimers.set(roomId, timer);
}

/**
 * Registers all room-related socket event handlers
 * Separates socket communication logic from room business logic
 * @param io - Socket.IO server instance for broadcasting
 * @param socket - Individual socket connection
 */
export function registerRoomHandlers(io: Server, socket: Socket): void {
  /**
   * create-room event handler
   * Creates a new room and adds the requesting player to it as host
   */
  socket.on(
    "create-room",
    (payload: { roomId: string; playerName: string }, callback?: (response: any) => void) => {
      const { roomId, playerName } = payload;

      // Validate player name
      const nameValidation = roomManager.validatePlayerName(playerName);
      if (!nameValidation.valid) {
        socket.emit("room-error", { message: nameValidation.error });
        if (callback) callback({ success: false, error: nameValidation.error });
        return;
      }

      // Validate room ID
      const roomIdValidation = roomManager.validateRoomId(roomId);
      if (!roomIdValidation.valid) {
        socket.emit("room-error", { message: roomIdValidation.error });
        if (callback) callback({ success: false, error: roomIdValidation.error });
        return;
      }

      // Check if room already exists
      if (roomManager.roomExists(roomId)) {
        socket.emit("room-error", { message: "Room already exists" });
        if (callback) callback({ success: false, error: "Room already exists" });
        return;
      }

      // Create room with current socket as host
      const room = roomManager.createRoom(roomId, socket.id);

      // Create player object with socket id
      const player: Player = {
        id: socket.id,
        name: playerName.trim(),
        isReady: false, // Start not ready
        score: 0,
      };

      // Add player to room with validation
      const addResult = roomManager.addPlayerToRoom(roomId, player);
      if (!addResult.success) {
        socket.emit("room-error", { message: addResult.error });
        roomManager.deleteRoom(roomId);
        if (callback) callback({ success: false, error: addResult.error });
        return;
      }

      // Join socket to Socket.IO room for efficient broadcasting
      socket.join(roomId);

      // Broadcast updated room to all clients in the Socket.IO room
      emitPublicRoomUpdate(io, addResult.room!);

      if (callback) callback({ success: true, room: createPublicRoomState(addResult.room!) });
      console.log(`Room created: ${roomId}, Host: ${playerName}`);
    }
  );

  /**
   * join-room event handler
   * Adds a player to an existing room
   */
  socket.on(
    "join-room",
    (payload: { roomId: string; playerName: string }, callback?: (response: any) => void) => {
      const { roomId, playerName } = payload;

      // Validate player name
      const nameValidation = roomManager.validatePlayerName(playerName);
      if (!nameValidation.valid) {
        socket.emit("room-error", { message: nameValidation.error });
        if (callback) callback({ success: false, error: nameValidation.error });
        return;
      }

      // Validate room ID
      const roomIdValidation = roomManager.validateRoomId(roomId);
      if (!roomIdValidation.valid) {
        socket.emit("room-error", { message: roomIdValidation.error });
        if (callback) callback({ success: false, error: roomIdValidation.error });
        return;
      }

      // Check if room exists
      if (!roomManager.roomExists(roomId)) {
        socket.emit("room-error", { message: `Room "${roomId}" does not exist` });
        if (callback) callback({ success: false, error: `Room "${roomId}" does not exist` });
        console.log(`Join failed: Room "${roomId}" not found`);
        return;
      }

      // Check if player is already in this room
      if (roomManager.isPlayerAlreadyInRoom(roomId, socket.id)) {
        socket.emit("room-error", { message: "You are already in this room" });
        if (callback) callback({ success: false, error: "You are already in this room" });
        return;
      }

      // Create player object
      const player: Player = {
        id: socket.id,
        name: playerName.trim(),
        isReady: false, // Start not ready
        score: 0,
      };

      // Add player to room with validation
      const addResult = roomManager.addPlayerToRoom(roomId, player);
      if (!addResult.success) {
        socket.emit("room-error", { message: addResult.error });
        if (callback) callback({ success: false, error: addResult.error });
        return;
      }

      // Join socket to Socket.IO room
      socket.join(roomId);

      // Broadcast updated room to all clients in the room
      emitPublicRoomUpdate(io, addResult.room!);

      if (callback) callback({ success: true, room: createPublicRoomState(addResult.room!) });
      console.log(`Player joined: ${playerName} joined room ${roomId}`);
    }
  );

  /**
   * toggle-ready event handler
   * Player toggles their ready status
   */
  socket.on("toggle-ready", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    // Toggle ready status
    const result = roomManager.togglePlayerReady(room.id, socket.id);
    if (!result.success) {
      socket.emit("room-error", { message: result.error });
      return;
    }

    // Broadcast updated room to all clients in the room
    emitPublicRoomUpdate(io, result.room!);

    const player = result.room!.players.find((p) => p.id === socket.id);
    console.log(`Player ready status: ${player?.name} is now ${player?.isReady ? "ready" : "not ready"}`);
  });

  /**
   * start-game event handler
   * Host starts the game
   */
  socket.on("start-game", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    // Check if player is host
    if (!roomManager.isPlayerHost(room.id, socket.id)) {
      socket.emit("room-error", { message: "Only the host can start the game" });
      return;
    }

    // Validate game can start
    const gameValidation = gameManager.validateGameStart(room);
    if (!gameValidation.valid) {
      socket.emit("room-error", { message: gameValidation.error });
      return;
    }

    // Initialize game
    const gameInit = gameManager.initializeGame(room);
    if (!gameInit.success) {
      socket.emit("room-error", { message: gameInit.error });
      return;
    }

    // Transition room to playing state
    const gameStart = roomManager.startGame(room.id);
    if (!gameStart.success || !gameStart.room) {
      socket.emit("room-error", { message: gameStart.error });
      return;
    }

    turnManager.resetTurnState(gameStart.room);
    const turnStart = turnManager.startNextTurn(gameStart.room);
    if (!turnStart.success || !turnStart.room) {
      socket.emit("room-error", { message: turnStart.error });
      return;
    }

    // Broadcast public game state, then send private word state to each player.
    io.to(room.id).emit("game-started", createPublicRoomState(turnStart.room));
    emitPublicRoomUpdate(io, turnStart.room);
    emitWordState(io, turnStart.room);
    io.to(room.id).emit("clear-canvas");
    io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Game started."));
    startTurnTimer(io, room.id);

    console.log(`Game started in room ${room.id}`);
  });

  /**
   * next-turn event handler
   * Manual turn advancement for testing turn rotation before timers exist.
   */
  socket.on("next-turn", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    if (!roomManager.isPlayerHost(room.id, socket.id)) {
      socket.emit("room-error", { message: "Only the host can advance turns" });
      return;
    }

    const drawer = room.players.find((player) => player.id === room.currentDrawerId);
    if (drawer && room.guessedPlayerIds.length > 0) {
      drawer.score += GAME_CONSTANTS.DRAWER_BONUS_POINTS;
    }

    const nextTurn = turnManager.advanceTurn(room);
    if (!nextTurn.success || !nextTurn.room) {
      socket.emit("room-error", { message: nextTurn.error });
      return;
    }

    if (nextTurn.room.status === GameStatus.FINISHED) {
      endGame(io, nextTurn.room);
      return;
    }

    emitPublicRoomUpdate(io, nextTurn.room);
    emitWordState(io, nextTurn.room);
    io.to(room.id).emit("clear-canvas");
    io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Next turn started."));
    startTurnTimer(io, room.id);

    console.log(`Next turn started in room ${room.id}`);
  });

  /**
   * submit-guess event handler
   * Placeholder for future guessing/scoring flow.
   */
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
      player.score += GAME_CONSTANTS.CORRECT_GUESS_POINTS;

      io.to(room.id).emit("correct-guess", { playerId: socket.id, playerName: player.name });
      io.to(room.id).emit(
        "chat-message",
        createSystemMessage(room.id, `${player.name} guessed correctly.`, "correct")
      );
      emitPublicRoomUpdate(io, room);

      const guessers = room.players.filter((roomPlayer) => roomPlayer.id !== room.currentDrawerId);
      if (guessers.length > 0 && room.guessedPlayerIds.length >= guessers.length) {
        const drawer = room.players.find((roomPlayer) => roomPlayer.id === room.currentDrawerId);
        if (drawer) {
          drawer.score += GAME_CONSTANTS.DRAWER_BONUS_POINTS;
        }
        const nextTurn = turnManager.advanceTurn(room);
        if (!nextTurn.success || !nextTurn.room) return;

        if (nextTurn.room.status === GameStatus.FINISHED) {
          endGame(io, nextTurn.room);
          return;
        }

        emitPublicRoomUpdate(io, nextTurn.room);
        emitWordState(io, nextTurn.room);
        io.to(room.id).emit("clear-canvas");
        io.to(room.id).emit("chat-message", createSystemMessage(room.id, "Everyone guessed. Next turn."));
        startTurnTimer(io, room.id);
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

  /**
   * leave-room event handler
   * Lets a connected player voluntarily leave their current room.
   */
  socket.on("leave-room", () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit("room-error", { message: "Not in a room" });
      return;
    }

    const roomId = room.id;
    const updatedRoom = roomManager.removePlayerFromRoom(roomId, socket.id);

    socket.leave(roomId);
    socket.emit("room-left", { roomId });

    if (updatedRoom) {
      emitPublicRoomUpdate(io, updatedRoom);
      const host = roomManager.getHostPlayer(roomId);
      console.log(`Player left room ${roomId}. Host is now ${host?.name || "unknown"}`);
      return;
    }

    console.log(`Player left room ${roomId}. Room deleted because it is empty.`);
  });

  /**
   * Handle player disconnect
   * Removes player from their room, transfers host if needed
   */
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    // Find and remove player from whatever room they're in
    const room = roomManager.removePlayerBySocketId(socket.id);

    if (room) {
      // Check if host transferred
      const host = roomManager.getHostPlayer(room.id);
      console.log(`Host in room ${room.id} is now ${host?.name || "unknown"}`);

      // Notify remaining players in the room about the update
      emitPublicRoomUpdate(io, room);
      console.log(`Player removed from room: ${room.id}`);
    }
    // If room was empty, it was automatically deleted by removePlayerBySocketId
  });
}


