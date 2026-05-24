import { Server, Socket } from "socket.io";
import * as roomManager from "../rooms/roomManager";
import { DrawData } from "../types/drawing.types";

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function validateDrawData(data: DrawData): { valid: boolean; error?: string } {
  if (!data || typeof data.roomId !== "string" || data.roomId.trim().length === 0) {
    return { valid: false, error: "Invalid drawing room" };
  }

  if (
    !isFiniteNumber(data.x) ||
    !isFiniteNumber(data.y) ||
    !isFiniteNumber(data.prevX) ||
    !isFiniteNumber(data.prevY)
  ) {
    return { valid: false, error: "Invalid drawing coordinates" };
  }

  if (typeof data.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(data.color)) {
    return { valid: false, error: "Invalid drawing color" };
  }

  if (!isFiniteNumber(data.lineWidth) || data.lineWidth < 1 || data.lineWidth > 40) {
    return { valid: false, error: "Invalid drawing line width" };
  }

  return { valid: true };
}

/**
 * Registers realtime drawing socket handlers.
 * Drawing pixels are rendered by clients, but permissions and room isolation stay server-owned.
 */
export function registerDrawingHandlers(io: Server, socket: Socket): void {
  socket.on("draw-line", (data: DrawData) => {
    const dataValidation = validateDrawData(data);
    if (!dataValidation.valid) {
      socket.emit("room-error", { message: dataValidation.error });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== data.roomId) {
      socket.emit("room-error", { message: "Not in this room" });
      return;
    }

    const drawValidation = roomManager.validatePlayerCanDraw(data.roomId, socket.id);
    if (!drawValidation.valid) {
      socket.emit("room-error", { message: drawValidation.error });
      return;
    }

    socket.to(data.roomId).emit("draw-line", data);
  });

  socket.on("clear-canvas", (payload: { roomId: string }) => {
    const roomId = payload?.roomId;
    if (typeof roomId !== "string") {
      socket.emit("room-error", { message: "Invalid room" });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== roomId) {
      socket.emit("room-error", { message: "Not in this room" });
      return;
    }

    const clearValidation = roomManager.validatePlayerCanClearCanvas(roomId, socket.id);
    if (!clearValidation.valid) {
      socket.emit("room-error", { message: clearValidation.error });
      return;
    }

    io.to(roomId).emit("clear-canvas");
  });
}
