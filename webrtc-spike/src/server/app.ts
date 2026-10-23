import { createServer, type Server } from "node:http";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { parseSignal, type SignalMessage } from "../shared/signaling.js";
import { Rooms, type Peer } from "./rooms.js";

/**
 * Load balancers and tunnels close a connection after ~60 s with no traffic, and the signaling socket is silent
 * while someone waits in a room. A ping every 25 s keeps it open; a socket that misses a pong is closed, which
 * also tells the other person they left.
 */
const HEARTBEAT_MS = 25_000;

/** One HTTP server that serves the built page and the /ws signaling socket, so one tunnel gives https + wss. */
export function createApp(staticDir: string, heartbeatMs = HEARTBEAT_MS): Server {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => void res.json({ status: "ok" }));
  app.use(express.static(staticDir));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
  const rooms = new Rooms();

  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, heartbeatMs);
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (socket: WebSocket) => {
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
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

  server.on("close", () => wss.close());
  return server;
}
