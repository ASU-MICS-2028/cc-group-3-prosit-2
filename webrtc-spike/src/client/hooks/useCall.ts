import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalMessage } from "../../shared/signaling";
import { summariseStats, type CallStats } from "../lib/stats";

// Only a public STUN server, on purpose: no TURN. If the cross-network call
// fails, that is the Lab 7 finding (see learnings/lab7-webrtc.md).
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const STATS_INTERVAL_MS = 1000;

export type CallStatus =
  | { kind: "idle" }
  | { kind: "joining" }
  | { kind: "waiting" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "ended"; reason: string }
  | { kind: "error"; message: string };

export interface UseCall {
  status: CallStatus;
  stats: CallStats | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  join: (room: string) => Promise<void>;
  leave: () => void;
}

export function useCall(): UseCall {
  const [status, setStatus] = useState<CallStatus>({ kind: "idle" });
  const [stats, setStats] = useState<CallStats | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const leave = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    socketRef.current?.close();
    pcRef.current?.close();
    localRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current = pcRef.current = localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStats(null);
  }, []);

  // Release the camera and sockets if the component goes away mid-call.
  useEffect(() => leave, [leave]);

  const join = useCallback(
    async (room: string) => {
      setStatus({ kind: "joining" });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "unknown error";
        setStatus({ kind: "error", message: `Camera or microphone unavailable (${name}). The page must be served over https:// or localhost.` });
        return;
      }
      localRef.current = stream;
      setLocalStream(stream);

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${proto}://${location.host}/ws`);
      socketRef.current = socket;
      const send = (msg: SignalMessage) => socket.send(JSON.stringify(msg));

      const makePeer = (): RTCPeerConnection => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = (e) => setRemoteStream(e.streams[0] ?? null);
        pc.onicecandidate = (e) => {
          if (e.candidate) send({ type: "candidate", candidate: e.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setStatus({ kind: "connected" });
            timerRef.current = window.setInterval(async () => {
              setStats(summariseStats(await pc.getStats()));
            }, STATS_INTERVAL_MS);
          } else if (pc.connectionState === "failed") {
            setStatus({ kind: "error", message: "Connection failed: no direct path between the two devices (a TURN relay would be needed)." });
          }
        };
        return pc;
      };

      socket.onopen = () => send({ type: "join", room });
      socket.onerror = () => setStatus({ kind: "error", message: "Could not reach the signaling server." });
      socket.onmessage = async (ev) => {
        const msg = JSON.parse(String(ev.data)) as SignalMessage;
        try {
          switch (msg.type) {
            case "full":
              setStatus({ kind: "error", message: "That room already has two people." });
              break;
            case "joined":
              if (!msg.initiator) {
                setStatus({ kind: "waiting" });
                break;
              }
              setStatus({ kind: "connecting" });
              {
                const pc = makePeer();
                await pc.setLocalDescription(await pc.createOffer());
                if (pc.localDescription) send({ type: "offer", sdp: pc.localDescription.toJSON() });
              }
              break;
            case "offer": {
              setStatus({ kind: "connecting" });
              const pc = makePeer();
              await pc.setRemoteDescription(msg.sdp);
              await pc.setLocalDescription(await pc.createAnswer());
              if (pc.localDescription) send({ type: "answer", sdp: pc.localDescription.toJSON() });
              break;
            }
            case "answer":
              await pcRef.current?.setRemoteDescription(msg.sdp);
              break;
            case "candidate":
              await pcRef.current?.addIceCandidate(msg.candidate);
              break;
            case "peer-left":
              leave();
              setStatus({ kind: "ended", reason: "The other person left." });
              break;
          }
        } catch (e) {
          setStatus({ kind: "error", message: e instanceof Error ? e.message : "Call setup failed." });
        }
      };
    },
    [leave],
  );

  return { status, stats, localStream, remoteStream, join, leave };
}
