import { createServer, type Server } from "node:http";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { parseSignal, type SignalMessage } from "../shared/signaling.js";
import { Rooms, type Peer } from "./rooms.js";

/** One HTTP server that serves the built page and the /ws signaling socket, so one tunnel gives https + wss. */
export function createApp(staticDir: string): Server {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => void res.json({ status: "ok" }));
  app.use(express.static(staticDir));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
  const rooms = new Rooms();

  wss.on("connection", (socket: WebSocket) => {
    const peer: Peer = {
      send: (msg: SignalMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      },
    };
    let room: string | null = null;

    socket.on("message", (data) => {
      const msg = parseSignal(data.toString());
      if (!msg) return;
      if (msg.type === "join") {
        if (room !== null) return; // already in a room
        const result = rooms.join(msg.room, peer);
        if (result === "full") return peer.send({ type: "full" });
        room = msg.room;
        return peer.send({ type: "joined", initiator: result === "initiator" });
      }
      if (room !== null) rooms.relay(room, peer, msg);
    });

    socket.on("close", () => {
      if (room !== null) rooms.leave(room, peer);
    });
  });

  return server;
}
