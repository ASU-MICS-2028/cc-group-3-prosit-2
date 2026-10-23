import type { SignalMessage } from "../shared/signaling.js";

export interface Peer {
  send(msg: SignalMessage): void;
}

export type JoinResult = "initiator" | "waiting" | "full";

const MAX_PEERS = 2;

/** Who is in which room. Pure logic with no sockets, so it is easy to test. */
export class Rooms {
  private rooms = new Map<string, Set<Peer>>();

  join(room: string, peer: Peer): JoinResult {
    const peers = this.rooms.get(room) ?? new Set<Peer>();
    if (peers.size >= MAX_PEERS) return "full";
    peers.add(peer);
    this.rooms.set(room, peers);
    // The second person to arrive starts the call.
    return peers.size === MAX_PEERS ? "initiator" : "waiting";
  }

  relay(room: string, from: Peer, msg: SignalMessage): void {
    for (const peer of this.rooms.get(room) ?? []) {
      if (peer !== from) peer.send(msg);
    }
  }

  leave(room: string, peer: Peer): void {
    const peers = this.rooms.get(room);
    if (!peers) return;
    peers.delete(peer);
    if (peers.size === 0) this.rooms.delete(room);
    else for (const p of peers) p.send({ type: "peer-left" });
  }
}
