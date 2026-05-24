import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { registerRoomHandlers } from "./socket/roomHandlers";
import { registerDrawingHandlers } from "./socket/drawingHandlers";

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Register all room-related event handlers
  registerRoomHandlers(io, socket);
  registerDrawingHandlers(io, socket);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
