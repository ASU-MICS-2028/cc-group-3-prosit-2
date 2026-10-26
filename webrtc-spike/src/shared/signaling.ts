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
  | { type: "offer"; sdp: SdpInit; name?: string }
  | { type: "answer"; sdp: SdpInit; name?: string }
  | { type: "candidate"; candidate: CandidateInit };

/** Longest display name accepted from a socket. */
export const MAX_NAME_LENGTH = 40;

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
  const msg = value as { type?: unknown; room?: unknown; name?: unknown };
  if (typeof msg.type !== "string" || !TYPES.has(msg.type)) return null;
  if (msg.type === "join" && (typeof msg.room !== "string" || msg.room.length === 0 || msg.room.length > 64)) return null;
  if (msg.type === "offer" || msg.type === "answer") {
    // The display name is optional, but if present it must be a short string.
    if (msg.name !== undefined && (typeof msg.name !== "string" || msg.name.length > MAX_NAME_LENGTH)) return null;
  }
  return value as SignalMessage;
}
