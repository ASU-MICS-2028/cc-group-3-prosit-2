import { judge, QualityMonitor } from "./quality";
import { parseSignal, type SignalMessage } from "./signaling";
import { isRelayed, summariseStats, type CallStats } from "./stats";

/** Address of the signaling server (the Lab 7 server, hosted at call-hc.agroconnect.space). */
export const CALL_URL: string = (import.meta.env.VITE_CALL_WS as string | undefined) ?? "wss://call-hc.agroconnect.space/ws";

/** Public STUN only, as in Lab 7. If a call across two mobile networks fails, that is the TURN finding
 *  (learnings/lab7-webrtc.md). A TURN relay can be added with VITE_TURN_URL / _USERNAME / _CREDENTIAL. */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const url = import.meta.env.VITE_TURN_URL as string | undefined;
  if (url) servers.push({ urls: url, username: import.meta.env.VITE_TURN_USERNAME as string | undefined, credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined });
  return servers;
}

export type Phase = "idle" | "starting" | "waiting" | "connecting" | "connected" | "reconnecting" | "ended" | "error";
export type Quality = "good" | "weak" | "audio";

export type CallState = {
  phase: Phase;
  /** Plain-words reason, set when the call ended or failed, and for notices during the call. */
  message?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteName: string | null;
  remoteVideoOn: boolean;
  muted: boolean;
  cameraOff: boolean;
  audioOnly: boolean;
  quality: Quality;
  suggestAudio: boolean;
  seconds: number;
  relayed: boolean | null;
  stats: CallStats | null;
};

export type JoinOptions = { room: string; name: string; audioOnly: boolean };

/** What the screens use. A fake with the same shape is used in tests. */
export interface CallApi {
  getState(): CallState;
  subscribe(listener: () => void): () => void;
  join(opts: JoinOptions): Promise<void>;
  leave(): void;
  toggleMute(): void;
  toggleCamera(): Promise<void>;
  setAudioOnly(on: boolean): Promise<void>;
  dismissSuggestion(): void;
}

export const initialState = (): CallState => ({
  phase: "idle", localStream: null, remoteStream: null, remoteName: null, remoteVideoOn: true, muted: false, cameraOff: false,
  audioOnly: false, quality: "good", suggestAudio: false, seconds: 0, relayed: null, stats: null,
});

const VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 }, facingMode: "user" } as const;
const MAX_VIDEO_BITRATE = 150_000;   // about 150 kbit/s: usable on 3G
const STATS_EVERY_MS = 2000;
const RECONNECT_GRACE_MS = 10_000;

function mediaErrorText(e: unknown): string {
  if (!window.isSecureContext) return "Calls need a secure page (https). Use the secure address.";
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "The camera or microphone is blocked. Allow it in the browser's settings, then try again.";
  if (name === "NotFoundError") return "No camera or microphone was found.";
  if (name === "NotReadableError") return "The camera or microphone is being used by another app. Close it and try again.";
  return "We couldn't start the camera or microphone.";
}

export class CallEngine implements CallApi {
  private state = initialState();
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null;
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private clock: ReturnType<typeof setInterval> | undefined;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;
  private monitor = new QualityMonitor();
  private name = "";
  private left = false;

  constructor(private url: string = CALL_URL) {}

  getState = () => this.state;
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  private set(patch: Partial<CallState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }

  /* ---------- joining ---------- */

  async join({ room, name, audioOnly }: JoinOptions): Promise<void> {
    if (this.state.phase !== "idle" && this.state.phase !== "ended" && this.state.phase !== "error") return;   // already in a call
    this.cleanup();
    this.left = false; this.name = name; this.monitor.reset();
    this.state = { ...initialState(), phase: "starting", audioOnly };
    this.set({});

    let stream: MediaStream;
    let fellBack = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: audioOnly ? false : VIDEO });
    } catch (e) {
      const n = e instanceof DOMException ? e.name : "";
      if (!audioOnly && (n === "NotFoundError" || n === "OverconstrainedError" || n === "NotReadableError")) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); fellBack = true; }
        catch (e2) { return this.set({ phase: "error", message: mediaErrorText(e2) }); }
      } else return this.set({ phase: "error", message: mediaErrorText(e) });
    }
    if (this.left) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.set({ localStream: stream, audioOnly: audioOnly || fellBack, message: fellBack ? "The camera isn't available, so this call is audio only." : undefined });

    const socket = new WebSocket(this.url);
    this.socket = socket;
    const send = (m: SignalMessage) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m)); };
    const opened = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) this.fail("We couldn't reach the call server. Check your signal and try again."); }, 10_000);

    socket.onopen = () => { clearTimeout(opened); send({ type: "join", room }); };
    socket.onerror = () => this.fail("We couldn't reach the call server. Check your signal and try again.");
    socket.onclose = () => { if (!this.left && (this.state.phase === "waiting" || this.state.phase === "starting")) this.fail("The connection to the call server was lost. Try again."); };
    socket.onmessage = async (ev) => {
      const msg = parseSignal(String(ev.data));
      if (!msg) return;
      try {
        switch (msg.type) {
          case "full": this.fail("That call already has two people."); break;
          case "joined":
            if (!msg.initiator) { this.set({ phase: "waiting" }); break; }
            this.set({ phase: "connecting" });
            { const pc = this.makePeer(stream, send); await pc.setLocalDescription(await pc.createOffer()); if (pc.localDescription) send({ type: "offer", sdp: pc.localDescription.toJSON(), name: this.name }); }
            break;
          case "offer": {
            this.set({ phase: "connecting", remoteName: msg.name?.trim() || null });
            const pc = this.makePeer(stream, send);
            await pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
            await pc.setLocalDescription(await pc.createAnswer());
            if (pc.localDescription) send({ type: "answer", sdp: pc.localDescription.toJSON(), name: this.name });
            break;
          }
          case "answer": this.set({ remoteName: msg.name?.trim() || null }); await this.pc?.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit); break;
          case "candidate": await this.pc?.addIceCandidate(msg.candidate as RTCIceCandidateInit); break;
          case "peer-left": this.end("The other person left."); break;
        }
      } catch { this.fail("The call couldn't be set up. Please try again."); }
    };
  }

  private makePeer(stream: MediaStream, send: (m: SignalMessage) => void): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.pc = pc;
    for (const t of stream.getTracks()) { const sender = pc.addTrack(t, stream); if (t.kind === "video") this.videoSender = sender; }
    // Even in an audio-only call the video line is reserved, so "turn camera on" later needs no new setup.
    if (!this.videoSender) this.videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    // A small channel both sides open with the same id, used only to say "my camera is on/off".
    const ctl = pc.createDataChannel("ctl", { negotiated: true, id: 0 });
    this.ctl = ctl;
    ctl.onopen = () => this.sendCtl({ video: !this.state.audioOnly && !this.state.cameraOff });
    ctl.onmessage = (e) => { try { const m = JSON.parse(String(e.data)) as { video?: unknown }; if (typeof m.video === "boolean") this.set({ remoteVideoOn: m.video }); } catch { /* ignore */ } };

    pc.ontrack = (e) => this.set({ remoteStream: e.streams[0] ?? null });
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: "candidate", candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") {
        clearTimeout(this.graceTimer);
        this.set({ phase: "connected", message: undefined });
        void this.limitBitrate(pc);
        this.startTimers(pc);
      } else if (s === "disconnected") {
        this.set({ phase: "reconnecting", message: "Connection lost. Trying to reconnect…" });
        clearTimeout(this.graceTimer);
        this.graceTimer = setTimeout(() => { if (this.pc?.connectionState !== "connected") this.fail("The connection was lost. You can try the call again, or use a voice call."); }, RECONNECT_GRACE_MS);
      } else if (s === "failed") {
        this.fail("The two phones couldn't connect. This can happen across two mobile networks. Try again, or use a voice call.");
      }
    };
    return pc;
  }

  /** Keep video small enough for 3G. Audio is left alone. */
  private async limitBitrate(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      try { const p = sender.getParameters(); if (p.encodings?.length) { p.encodings[0].maxBitrate = MAX_VIDEO_BITRATE; p.encodings[0].maxFramerate = 15; await sender.setParameters(p); } } catch { /* the browser may refuse; the call still works */ }
    }
  }

  private startTimers(pc: RTCPeerConnection) {
    clearInterval(this.statsTimer); clearInterval(this.clock);
    const t0 = Date.now();
    this.clock = setInterval(() => this.set({ seconds: Math.floor((Date.now() - t0) / 1000) }), 1000);
    this.statsTimer = setInterval(async () => {
      if (pc.connectionState !== "connected") return;
      const stats = summariseStats(await pc.getStats());
      const videoExpected = !this.state.audioOnly && this.state.remoteVideoOn;
      const r = this.monitor.feed(judge(stats, { videoExpected }));
      this.set({ stats, relayed: isRelayed(stats), quality: this.state.audioOnly ? "audio" : r.quality, suggestAudio: !this.state.audioOnly && r.suggestAudio });
      if (r.switchToAudio && !this.state.audioOnly) { await this.setAudioOnly(true); this.set({ message: "The connection was weak, so the call switched to audio only." }); }
    }, STATS_EVERY_MS);
  }

  /* ---------- during the call ---------- */

  toggleMute() {
    const muted = !this.state.muted;
    this.state.localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    this.set({ muted });
  }

  async toggleCamera() {
    if (this.state.audioOnly) return this.setAudioOnly(false);   // from audio only, "camera on" means going back to video
    const cameraOff = !this.state.cameraOff;
    this.state.localStream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    this.set({ cameraOff });
    this.sendCtl({ video: !cameraOff });
  }

  /** Audio only: the camera is switched off and nothing is sent, which saves most of the bandwidth. */
  async setAudioOnly(on: boolean) {
    const stream = this.state.localStream;
    if (!stream || this.state.audioOnly === on) return;
    if (on) {
      const track = stream.getVideoTracks()[0];
      await this.videoSender?.replaceTrack(null);
      track?.stop(); if (track) stream.removeTrack(track);
      this.set({ audioOnly: true, quality: "audio", suggestAudio: false, localStream: new MediaStream(stream.getTracks()) });
      this.sendCtl({ video: false });
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
      const track = cam.getVideoTracks()[0];
      stream.addTrack(track);
      await this.videoSender?.replaceTrack(track);
      this.monitor.reset();
      this.set({ audioOnly: false, cameraOff: false, quality: "good", localStream: new MediaStream(stream.getTracks()), message: undefined });
      this.sendCtl({ video: true });
    } catch (e) { this.set({ message: mediaErrorText(e) }); }
  }
  private videoSender: RTCRtpSender | undefined;

  dismissSuggestion() { this.set({ suggestAudio: false }); }

  private sendCtl(m: { video: boolean }) { if (this.ctl?.readyState === "open") this.ctl.send(JSON.stringify(m)); }

  /* ---------- ending ---------- */

  leave() { this.left = true; this.cleanup(); this.set({ ...initialState(), phase: "ended", message: "You left the call." }); }
  private end(message: string) { this.left = true; const seconds = this.state.seconds; this.cleanup(); this.set({ ...initialState(), phase: "ended", message, seconds }); }
  private fail(message: string) { if (this.left) return; this.left = true; this.cleanup(); this.set({ ...initialState(), phase: "error", message }); }

  private cleanup() {
    clearInterval(this.statsTimer); clearInterval(this.clock); clearTimeout(this.graceTimer);
    this.socket?.close(); this.pc?.close();
    this.state.localStream?.getTracks().forEach((t) => t.stop());
    this.socket = null; this.pc = null; this.ctl = null; this.videoSender = undefined;
  }
}
