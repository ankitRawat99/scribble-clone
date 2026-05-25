/**
 * reconnect.ts — Client-side reconnect token management
 *
 * BUG 6 FIX — Reconnect Identity System
 *
 * PROBLEM:
 * Socket.IO assigns a new socket.id on every reconnection. The server sees the
 * old socket disconnect and a "new stranger" connect. Without an identity token,
 * even a 1-second network blip permanently kicks the player — they lose their
 * room, score, turn, and all state.
 *
 * SOLUTION:
 * 1. Server generates a reconnectToken on join and sends it privately
 * 2. Client stores it in sessionStorage (survives page navigation, not tabs)
 * 3. On socket reconnect, client auto-sends rejoin-room { reconnectToken }
 * 4. Server matches token to grace record → restores player state
 *
 * WHY sessionStorage (not localStorage):
 * - sessionStorage is per-tab — opening a new tab = new session = new identity
 * - This prevents two tabs from fighting over the same reconnect token
 * - localStorage would cause identity collisions across tabs
 */

import { socket } from "./socket";

const RECONNECT_TOKEN_KEY = "skribbl_reconnect_token";

/** Store the reconnect token received from the server */
export function storeReconnectToken(token: string): void {
  try {
    sessionStorage.setItem(RECONNECT_TOKEN_KEY, token);
  } catch {
    // sessionStorage might be unavailable in some contexts
    console.warn("[reconnect] Failed to store reconnect token in sessionStorage");
  }
}

/** Retrieve the stored reconnect token */
export function getReconnectToken(): string | null {
  try {
    return sessionStorage.getItem(RECONNECT_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Clear the reconnect token (on voluntary leave or explicit logout) */
export function clearReconnectToken(): void {
  try {
    sessionStorage.removeItem(RECONNECT_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Initialize the reconnect system.
 * Call this once when the app starts. It:
 * 1. Listens for "reconnect-token" events from server (on initial join)
 * 2. On socket reconnect, automatically sends rejoin-room if a token exists
 * 3. Handles rejoin-success and rejoin-failed responses
 *
 * @param onRejoinSuccess - Callback when reconnect succeeds (receives room state)
 * @param onRejoinFailed  - Callback when reconnect fails (player must rejoin manually)
 */
export function initReconnectSystem(
  onRejoinSuccess: (data: { reconnectToken: string; room: any }) => void,
  onRejoinFailed: (data: { message: string }) => void
): () => void {
  // Listen for server sending us a new reconnect token (on initial join)
  const handleReconnectToken = ({ reconnectToken }: { reconnectToken: string }) => {
    storeReconnectToken(reconnectToken);
    console.log("[reconnect] Token stored");
  };

  // On socket reconnect, attempt to rejoin with stored token
  const handleConnect = () => {
    const token = getReconnectToken();
    if (token) {
      console.log("[reconnect] Socket reconnected — attempting rejoin with stored token");
      socket.emit("rejoin-room", { reconnectToken: token });
    }
  };

  // Server confirmed reconnect
  const handleRejoinSuccess = (data: { reconnectToken: string; room: any }) => {
    storeReconnectToken(data.reconnectToken);
    console.log("[reconnect] Rejoin successful");
    onRejoinSuccess(data);
  };

  // Server rejected reconnect (grace period expired, room gone, etc.)
  const handleRejoinFailed = (data: { message: string }) => {
    clearReconnectToken();
    console.log("[reconnect] Rejoin failed:", data.message);
    onRejoinFailed(data);
  };

  socket.on("reconnect-token", handleReconnectToken);
  socket.on("connect", handleConnect);
  socket.on("rejoin-success", handleRejoinSuccess);
  socket.on("rejoin-failed", handleRejoinFailed);

  // Return cleanup function
  return () => {
    socket.off("reconnect-token", handleReconnectToken);
    socket.off("connect", handleConnect);
    socket.off("rejoin-success", handleRejoinSuccess);
    socket.off("rejoin-failed", handleRejoinFailed);
  };
}
