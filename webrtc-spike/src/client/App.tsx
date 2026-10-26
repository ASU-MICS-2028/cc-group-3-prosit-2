import { useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH } from "../shared/signaling";
import { StatsPanel } from "./components/StatsPanel";
import { VideoTile } from "./components/VideoTile";
import { useCall, type CallStatus } from "./hooks/useCall";
import { generateCode, normaliseCode } from "./lib/callCode";

const STATUS_TEXT: Record<CallStatus["kind"], string> = {
  idle: "Not in a call.",
  joining: "Starting camera and joining…",
  waiting: "Joined. Waiting for the other person to enter the same call code…",
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
  const { status, stats, localStream, remoteStream, remoteName, join, leave } = useCall();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [mirror, setMirror] = useState(true);
  const inCall = status.kind !== "idle" && status.kind !== "ended" && status.kind !== "error";
  const cleanCode = normaliseCode(code);
  const cleanName = name.trim();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (cleanCode && cleanName) void join(cleanCode, cleanName);
  };

  return (
    <main>
      <h1>HealthConnect call test</h1>
      <p>Synthetic test only: no patient data. Use a first name or role, not a real patient's name.</p>
      <form onSubmit={onSubmit}>
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Ama"
            autoComplete="off"
            required
            disabled={inCall}
          />
        </label>
        <label>
          Call code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            placeholder="e.g. hc-4821"
            autoComplete="off"
            autoCapitalize="none"
            required
            disabled={inCall}
          />
        </label>
        {!inCall && <button type="button" onClick={() => setCode(generateCode())}>Generate code</button>}
        {inCall ? (
          <button type="button" onClick={leave}>Leave</button>
        ) : (
          <button type="submit" disabled={!cleanCode || !cleanName}>Join call</button>
        )}
      </form>
      <p className="hint">
        The call code is how two people find each other. One person taps <strong>Generate code</strong> and sends it to the
        other; both enter the same code and press Join. Capital letters don't matter.
      </p>
      <label className="mirror">
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror my video
        (only changes how you see yourself)
      </label>
      <p role="status" aria-live="polite">{statusText(status)}</p>
      <section className="tiles">
        <VideoTile stream={localStream} label={cleanName ? `${cleanName} (you)` : "You"} muted mirrored={mirror} />
        <VideoTile stream={remoteStream} label={remoteName ?? (inCall ? "Waiting for the other person" : "Other person")} />
      </section>
      <h2>Live stats</h2>
      <StatsPanel stats={stats} />
    </main>
  );
}
