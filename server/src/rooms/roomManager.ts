import { Room, Player, GameStatus } from "../types/room.types";

// ============================================
// ROOM CONSTANTS
// ============================================

const ROOM_CONSTANTS = {
  MAX_PLAYERS_PER_ROOM: 12,
  MIN_PLAYER_NAME_LENGTH: 1,
  MAX_PLAYER_NAME_LENGTH: 20,
  MIN_ROOM_ID_LENGTH: 1,
  MAX_ROOM_ID_LENGTH: 50,
};

// Global room storage - backend owns all room state
const rooms = new Map<string, Room>();

// Track which room each socket belongs to (for cleanup on disconnect)
const socketToRoomMap = new Map<string, string>();

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validates a player name
 * @param name - The player name to validate
 * @returns Validation result with success flag and error message if invalid
 */
export function validatePlayerName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Player name cannot be empty" };
  }

  if (trimmed.length < ROOM_CONSTANTS.MIN_PLAYER_NAME_LENGTH) {
    return { valid: false, error: "Player name is too short" };
  }

  if (trimmed.length > ROOM_CONSTANTS.MAX_PLAYER_NAME_LENGTH) {
    return {
      valid: false,
      error: `Player name must be ${ROOM_CONSTANTS.MAX_PLAYER_NAME_LENGTH} characters or less`,
    };
  }

  return { valid: true };
}

/**
 * Validates a room ID
 * @param roomId - The room ID to validate
 * @returns Validation result with success flag and error message if invalid
 */
export function validateRoomId(roomId: string): { valid: boolean; error?: string } {
  const trimmed = roomId.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Room ID cannot be empty" };
  }

  if (trimmed.length < ROOM_CONSTANTS.MIN_ROOM_ID_LENGTH) {
    return { valid: false, error: "Room ID is too short" };
  }

  if (trimmed.length > ROOM_CONSTANTS.MAX_ROOM_ID_LENGTH) {
    return {
      valid: false,
      error: `Room ID must be ${ROOM_CONSTANTS.MAX_ROOM_ID_LENGTH} characters or less`,
    };
  }

  return { valid: true };
}

/**
 * Checks if a socket has already joined a room
 * @param roomId - The room ID to check
 * @param socketId - The socket ID to check
 * @returns True if player already in room, false otherwise
 */
export function isPlayerAlreadyInRoom(roomId: string, socketId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  return room.players.some((player) => player.id === socketId);
}

/**
 * Checks if a room is at capacity
 * @param roomId - The room to check
 * @returns True if room is full, false otherwise
 */
export function isRoomFull(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  return room.players.length >= ROOM_CONSTANTS.MAX_PLAYERS_PER_ROOM;
}

// ============================================
// ROOM MANAGEMENT FUNCTIONS
// ============================================

/**
 * Creates a new room and stores it in the room map
 * First player to join becomes host automatically
 * @param roomId - Unique identifier for the room (should be validated before calling)
 * @param hostId - Socket ID of the player creating the room
 * @returns The created room object
 */
export function createRoom(roomId: string, hostId: string): Room {
  const room: Room = {
    id: roomId,
    players: [],
    hostId: hostId, // First player is host
    currentDrawerId: null,
    currentWord: null,
    currentTurnIndex: 0,
    currentRound: 1,
    maxRounds: 3,
    turnEndsAt: null,
    guessedPlayerIds: [],
    status: GameStatus.WAITING, // Start in waiting state
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

/**
 * Retrieves a room from storage
 * @param roomId - The room to retrieve
 * @returns The room object or undefined if not found
 */
export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

/**
 * Checks if a room exists
 * @param roomId - The room to check
 * @returns True if room exists, false otherwise
 */
export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}

/**
 * Adds a player to a room with validation
 * @param roomId - The room to add player to
 * @param player - The player object to add (isReady will be set to false)
 * @returns Success result with room if successful, error message if failed
 */
export function addPlayerToRoom(
  roomId: string,
  player: Player
): {
  success: boolean;
  room?: Room;
  error?: string;
} {
  // Validate room exists
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: "Room does not exist" };
  }

  // Check if player is already in this room
  if (isPlayerAlreadyInRoom(roomId, player.id)) {
    return { success: false, error: "Player already in this room" };
  }

  // Check if room is full
  if (isRoomFull(roomId)) {
    return { success: false, error: "Room is full" };
  }

  // Ensure player starts not ready
  player.isReady = false;

  // Add player to room
  room.players.push(player);

  // Track socket to room mapping for disconnect cleanup
  socketToRoomMap.set(player.id, roomId);

  return { success: true, room };
}

/**
 * Removes a player from a specific room
 * Transfers host if needed
 * @param roomId - The room to remove player from
 * @param playerId - The id of the player to remove
 * @returns The updated room object or undefined if room doesn't exist or becomes empty
 */
export function removePlayerFromRoom(roomId: string, playerId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.players = room.players.filter((player) => player.id !== playerId);

  // Clean up socket mapping
  socketToRoomMap.delete(playerId);

  // Transfer host if needed
  if (room.hostId === playerId && room.players.length > 0) {
    const nextHost = room.players[0]!;
    room.hostId = nextHost.id;
    console.log(`Host transferred to ${room.hostId} in room ${roomId}`);
  }

  if (room.currentDrawerId === playerId) {
    room.currentDrawerId = room.players[0]?.id ?? null;
  }

  // If room is now empty, delete it to prevent orphaned rooms
  if (room.players.length === 0) {
    rooms.delete(roomId);
    return undefined;
  }

  return room;
}

/**
 * Removes a player from whatever room they're in
 * This is called on disconnect - finds room by socket ID
 * @param socketId - The socket ID of the disconnecting player
 * @returns The updated room if player was found, undefined otherwise
 */
export function removePlayerBySocketId(socketId: string): Room | undefined {
  const roomId = socketToRoomMap.get(socketId);
  if (!roomId) return undefined;

  return removePlayerFromRoom(roomId, socketId);
}

/**
 * Gets the room a player is currently in
 * @param socketId - The socket ID to look up
 * @returns The room object if found, undefined otherwise
 */
export function getRoomForSocket(socketId: string): Room | undefined {
  const roomId = socketToRoomMap.get(socketId);
  if (!roomId) return undefined;

  return rooms.get(roomId);
}

/**
 * Deletes an empty room (should only be called internally)
 * @param roomId - The room to delete
 * @returns True if room was deleted, false if room didn't exist
 */
export function deleteRoom(roomId: string): boolean {
  return rooms.delete(roomId);
}

/**
 * Gets all active rooms (useful for debugging/admin features)
 * @returns Array of all rooms
 */
export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}

// ============================================
// LOBBY FUNCTIONS
// ============================================

/**
 * Toggles a player's ready status
 * @param roomId - The room to update
 * @param playerId - The player to toggle
 * @returns Updated room if successful, undefined with error if failed
 */
export function togglePlayerReady(
  roomId: string,
  playerId: string
): { success: boolean; room?: Room; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: "Room does not exist" };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    return { success: false, error: "Player not in room" };
  }

  // Can only toggle ready in waiting state
  if (room.status !== GameStatus.WAITING) {
    return { success: false, error: "Cannot change ready status while game is in progress" };
  }

  player.isReady = !player.isReady;
  return { success: true, room };
}

/**
 * Checks if all players are ready
 * @param roomId - The room to check
 * @returns True if all players ready, false otherwise
 */
export function areAllPlayersReady(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || room.players.length === 0) return false;

  return room.players.every((player) => player.isReady);
}

/**
 * Gets the host player object
 * @param roomId - The room to check
 * @returns The host player or undefined if not found
 */
export function getHostPlayer(roomId: string): Player | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  return room.players.find((player) => player.id === room.hostId);
}

/**
 * Checks if a player is the host
 * @param roomId - The room to check
 * @param playerId - The player to check
 * @returns True if player is host, false otherwise
 */
export function isPlayerHost(roomId: string, playerId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  return room.hostId === playerId;
}

/**
 * Validates whether a player can draw in the room right now.
 * This is the authoritative multiplayer permission check for canvas events.
 * @param roomId - The room to validate
 * @param playerId - The player attempting to draw
 * @returns Validation result
 */
export function validatePlayerCanDraw(
  roomId: string,
  playerId: string
): { valid: boolean; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { valid: false, error: "Room does not exist" };
  }

  if (room.status !== GameStatus.PLAYING) {
    return { valid: false, error: "Drawing is only allowed while the game is playing" };
  }

  if (!room.players.some((player) => player.id === playerId)) {
    return { valid: false, error: "Player not in room" };
  }

  if (room.currentDrawerId !== playerId) {
    return { valid: false, error: "Only the current drawer can draw" };
  }

  return { valid: true };
}

/**
 * Validates whether a player can clear the canvas.
 * Hosts can clear manually; the server also clears everyone when a game starts.
 * @param roomId - The room to validate
 * @param playerId - The player attempting to clear
 * @returns Validation result
 */
export function validatePlayerCanClearCanvas(
  roomId: string,
  playerId: string
): { valid: boolean; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { valid: false, error: "Room does not exist" };
  }

  if (room.status !== GameStatus.PLAYING) {
    return { valid: false, error: "Canvas can only be cleared while the game is playing" };
  }

  if (room.currentDrawerId !== playerId) {
    return { valid: false, error: "Only the current drawer can clear the canvas" };
  }

  return { valid: true };
}

// ============================================
// GAME STATE FUNCTIONS
// ============================================

/**
 * Transitions room to playing state
 * Called when game starts
 * @param roomId - The room to update
 * @returns Updated room if successful, error if failed
 */
export function startGame(roomId: string): { success: boolean; room?: Room; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: "Room does not exist" };
  }

  if (room.status !== GameStatus.WAITING) {
    return { success: false, error: "Game already in progress or finished" };
  }

  room.status = GameStatus.PLAYING;
  return { success: true, room };
}

/**
 * Resets all players' ready status
 * Useful for restarting a new game
 * @param roomId - The room to update
 * @returns Updated room if successful
 */
export function resetPlayerReadyStatus(roomId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.players.forEach((player) => {
    player.isReady = false;
  });

  return room;
}

/**
 * Transitions room to finished state
 * Called when game ends
 * @param roomId - The room to update
 * @returns Updated room if successful, error if failed
 */
export function finishGame(roomId: string): { success: boolean; room?: Room; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: "Room does not exist" };
  }

  if (room.status !== GameStatus.PLAYING) {
    return { success: false, error: "Game is not in progress" };
  }

  room.status = GameStatus.FINISHED;
  return { success: true, room };
}
