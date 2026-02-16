import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "https://node.taila7c4f9.ts.net:3000";

const socket = io(API_URL, {
  autoConnect: true,
});

export default socket;
