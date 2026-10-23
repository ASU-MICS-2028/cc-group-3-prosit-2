import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "./app";

const servers: ReturnType<typeof createApp>[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function connect(heartbeatMs: number, autoPong = true): Promise<WebSocket> {
  const server = createApp("/nonexistent", heartbeatMs);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { autoPong });
  await new Promise((resolve) => socket.once("open", resolve));
  return socket;
}

describe("signaling heartbeat", () => {
  it("pings an idle socket and keeps it open while it answers", async () => {
    const socket = await connect(30);
    let pings = 0;
    socket.on("ping", () => pings++);
    await new Promise((r) => setTimeout(r, 200));
    expect(pings).toBeGreaterThanOrEqual(2);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("closes a socket that stops answering pings", async () => {
    const socket = await connect(30, false);
    const closed = new Promise((resolve) => socket.once("close", resolve));
    await expect(closed).resolves.toBeDefined();
  });
});
