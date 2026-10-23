// Messages passed between the two browsers through the signaling server.
// Shapes mirror the browser's own RTC types so they can be passed straight
// through, but are declared here so the server (no DOM) can use them too.

export interface SdpInit {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface CandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalMessage =
  | { type: "join"; room: string }
  | { type: "joined"; initiator: boolean }
  | { type: "full" }
  | { type: "peer-left" }
  | { type: "offer"; sdp: SdpInit }
  | { type: "answer"; sdp: SdpInit }
  | { type: "candidate"; candidate: CandidateInit };

const TYPES = new Set(["join", "joined", "full", "peer-left", "offer", "answer", "candidate"]);

/** Parse untrusted text from a socket. Returns null for anything that is not a known message. */
export function parseSignal(raw: string): SignalMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const msg = value as { type?: unknown; room?: unknown };
  if (typeof msg.type !== "string" || !TYPES.has(msg.type)) return null;
  if (msg.type === "join" && (typeof msg.room !== "string" || msg.room.length === 0 || msg.room.length > 64)) return null;
  return value as SignalMessage;
}
