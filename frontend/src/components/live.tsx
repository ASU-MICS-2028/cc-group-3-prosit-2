import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import { PrimaryButton, SecondaryButton } from "./buttons";
import { ConnectionIndicator, RecordingIndicator } from "./clinical";
import type { CallApi, CallState } from "../call/engine";
import { t } from "../i18n";

/** A <video> for a stream. The remote one also plays the other person's voice, so it stays in the page even when their camera is off. */
export function VideoSurface({ stream, muted, mirrored, hidden, className = "", label }: { stream: MediaStream | null; muted?: boolean; mirrored?: boolean; hidden?: boolean; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} className={`video-surface${mirrored ? " mirrored" : ""}${hidden ? " is-hidden" : ""} ${className}`} />;
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function LiveCall({ state, api, remoteLabel, children }: { state: CallState; api: CallApi; remoteLabel: string; children?: React.ReactNode }) {
  const { phase, remoteStream, localStream, remoteVideoOn, audioOnly, cameraOff, muted, quality, suggestAudio, seconds, message, remoteName } = state;
  const showRemoteVideo = phase === "connected" && remoteVideoOn && !!remoteStream;
  const title = remoteName ?? remoteLabel;

  // Keep the screen awake during a call (where the phone allows it).
  useEffect(() => {
    let lock: { release(): Promise<void> } | undefined;
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => undefined);
    return () => { void lock?.release(); };
  }, []);

  const waiting = phase === "starting" || phase === "waiting" || phase === "connecting";
  const caption =
    phase === "starting" ? "Starting…" : phase === "waiting" ? `Waiting for ${title} to join` : phase === "connecting" ? "Connecting…"
    : phase === "reconnecting" ? "Reconnecting…" : !remoteVideoOn || audioOnly ? "Audio only" : "";

  return (
    <div className="call call-live" role="region" aria-label={t("Video visit")}>
      <VideoSurface stream={remoteStream} hidden={!showRemoteVideo} label={t("{title}'s video", { title })} />
      <div className="call-top">
        {phase === "connected" || phase === "reconnecting" ? <ConnectionIndicator quality={phase === "reconnecting" ? "weak" : quality} /> : null}
        {phase === "connected" && <span className="badge conn tabular">{mmss(seconds)}</span>}
        {state.rec.status === "on" && <RecordingIndicator />}
      </div>
      {!showRemoteVideo && (
        <div className="call-remote">
          <span className="call-avatar" aria-hidden>{remoteName ? remoteName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : <Icon name="user" />}</span>
          <span className="call-name title-2">{title}</span>
          <span className="caption" role="status">{t(caption)}</span>
          {waiting && <span className="dots" aria-hidden><i /><i /><i /></span>}
        </div>
      )}
      {!audioOnly && !cameraOff && localStream && <VideoSurface stream={localStream} muted mirrored className="call-self" label={t("Your camera")} />}
      {message && <p className="call-note" role="status">{t(message)}</p>}
      {children}
      {suggestAudio && !audioOnly && (
        <div className="call-suggest" role="alert">
          <span>{t("The connection is weak. Switch to audio only?")}</span>
          <div className="row">
            <PrimaryButton onClick={() => void api.setAudioOnly(true)}>{t("Switch to audio")}</PrimaryButton>
            <SecondaryButton onClick={() => api.dismissSuggestion()}>{t("Keep video")}</SecondaryButton>
          </div>
        </div>
      )}
      <div className="call-controls">
        <button className={`call-btn${muted ? " is-off" : ""}`} aria-label={muted ? t("Unmute") : t("Mute")} aria-pressed={muted} onClick={() => api.toggleMute()}>
          <Icon name={muted ? "microphone-slash" : "microphone"} />
        </button>
        <button className={`call-btn${cameraOff || audioOnly ? " is-off" : ""}`} aria-label={audioOnly ? t("Turn video on") : cameraOff ? t("Turn camera on") : t("Turn camera off")} aria-pressed={cameraOff || audioOnly} onClick={() => void api.toggleCamera()}>
          <Icon name={cameraOff || audioOnly ? "video-camera-slash" : "video-camera"} />
        </button>
        <button className={`call-btn${audioOnly ? " is-off" : ""}`} aria-label={audioOnly ? t("Switch back to video") : t("Switch to audio only")} aria-pressed={audioOnly} onClick={() => void api.setAudioOnly(!audioOnly)}>
          <Icon name="phone" />
        </button>
        <button className="call-end" aria-label={t("End call")} onClick={() => api.leave()}><Icon name="phone-disconnect" /></button>
      </div>
    </div>
  );
}
