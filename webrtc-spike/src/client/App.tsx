import { useState, type FormEvent } from "react";
import { StatsPanel } from "./components/StatsPanel";
import { VideoTile } from "./components/VideoTile";
import { useCall, type CallStatus } from "./hooks/useCall";

const STATUS_TEXT: Record<CallStatus["kind"], string> = {
  idle: "Not in a call.",
  joining: "Starting camera and joining…",
  waiting: "Joined. Waiting for the other person…",
  connecting: "Connecting…",
  connected: "Connected.",
  ended: "Call ended.",
  error: "Something went wrong.",
};

function statusText(status: CallStatus): string {
  if (status.kind === "error") return status.message;
  if (status.kind === "ended") return status.reason;
  return STATUS_TEXT[status.kind];
}

export function App() {
  const { status, stats, localStream, remoteStream, join, leave } = useCall();
  const [room, setRoom] = useState("test-room");
  const inCall = status.kind !== "idle" && status.kind !== "ended" && status.kind !== "error";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void join(room.trim());
  };

  return (
    <main>
      <h1>HealthConnect call test</h1>
      <p>Both people use the same room name. Synthetic test only: no patient data.</p>
      <form onSubmit={onSubmit}>
        <label>
          Room name{" "}
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={64} required disabled={inCall} />
        </label>{" "}
        {inCall ? (
          <button type="button" onClick={leave}>Leave</button>
        ) : (
          <button type="submit" disabled={room.trim() === ""}>Join</button>
        )}
      </form>
      <p role="status" aria-live="polite">{statusText(status)}</p>
      <section className="tiles">
        <VideoTile stream={localStream} label="You" muted />
        <VideoTile stream={remoteStream} label="Other person" />
      </section>
      <h2>Live stats</h2>
      <StatsPanel stats={stats} />
    </main>
  );
}
