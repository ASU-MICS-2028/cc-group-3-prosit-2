import { describe, expect, it } from "vitest";
import type { SignalMessage } from "../shared/signaling";
import { Rooms, type Peer } from "./rooms";

const makePeer = () => {
  const received: SignalMessage[] = [];
  const peer: Peer = { send: (m) => void received.push(m) };
  return { peer, received };
};

describe("Rooms", () => {
  it("the second person starts the call and a third is refused", () => {
    const rooms = new Rooms();
    expect(rooms.join("r", makePeer().peer)).toBe("waiting");
    expect(rooms.join("r", makePeer().peer)).toBe("initiator");
    expect(rooms.join("r", makePeer().peer)).toBe("full");
  });

  it("relays only to the other person, and only within the room", () => {
    const rooms = new Rooms();
    const a = makePeer(), b = makePeer(), other = makePeer();
    rooms.join("r", a.peer);
    rooms.join("r", b.peer);
    rooms.join("elsewhere", other.peer);
    rooms.relay("r", a.peer, { type: "offer", sdp: { type: "offer", sdp: "x" } });
    expect(b.received).toHaveLength(1);
    expect(a.received).toHaveLength(0);
    expect(other.received).toHaveLength(0);
  });

  it("tells the remaining person when someone leaves, and frees the room", () => {
    const rooms = new Rooms();
    const a = makePeer(), b = makePeer();
    rooms.join("r", a.peer);
    rooms.join("r", b.peer);
    rooms.leave("r", a.peer);
    expect(b.received).toEqual([{ type: "peer-left" }]);
    rooms.leave("r", b.peer);
    expect(rooms.join("r", makePeer().peer)).toBe("waiting");
  });
});
