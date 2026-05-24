import { io } from "socket.io-client";

export const socket = io("io(import.meta.env.VITE_SERVER_URL)");