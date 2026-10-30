import { useEffect, useMemo, useRef, useState } from "react";
import { MicButton, SecondaryButton, TextButton } from "../components/buttons";
import { SyncBadge } from "../components/display";
import { Icon } from "../components/icons";
import { useData } from "../data/DataProvider";
import { RepoError, addMedia, markMediaInError, type View } from "../data/repo";
import { fromBase64, type Media } from "../data/model";
import { ImageError, compressImage } from "../media/image";
import { MAX_SECONDS, RecorderError, startRecording, type Recording } from "../media/recorder";

const kb = (n: number) => `${Math.max(1, Math.round(n / 1000))} KB`;
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{children}</p>;

/** An object URL for stored bytes, released when the picture or player goes away. */
function useObjectUrl(m: Media): string {
  const url = useMemo(() => URL.createObjectURL(new Blob([fromBase64(m.content.data) as BlobPart], { type: m.content.contentType })), [m.content.data, m.content.contentType]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

const messageOf = (e: unknown) =>
  e instanceof RepoError || e instanceof ImageError || e instanceof RecorderError ? e.message : e instanceof Error && /make small|too big/i.test(e.message) ? e.message : "We couldn't save that. Please try again.";

function MediaRow({ v, onMistake }: { v: View<Media>; onMistake: (id: string) => void }) {
  const m = v.resource;
  const mistake = m.status === "entered-in-error";
  const url = useObjectUrl(m);
  const isPhoto = m.type.coding[0].code === "image";
  return (
    <div className="photo-done">
      {mistake ? <span className="photo-thumb" aria-hidden /> : isPhoto ? <img className="photo-thumb" src={url} alt="Photo of the patient" /> : null}
      <div className="photo-meta">
        <span className="body-strong tabular">{isPhoto ? "Photo" : "Voice note"} · {kb(m.content.size)}</span>
        <span className="caption tabular">{when(m.createdDateTime)}</span>
        {!isPhoto && !mistake && <audio controls src={url} aria-label="Play voice note" />}
        {!isPhoto && !mistake && <span className="caption">Written text will be added when there is a signal.</span>}
        {mistake ? <span className="caption">Marked as a mistake</span> : <SyncBadge status={v.syncState} />}
        {!mistake && <TextButton onClick={() => onMistake(m.id)}>Mark as a mistake</TextButton>}
      </div>
    </div>
  );
}

export function PhotosSection({ patientId, media }: { patientId: string; media: View<Media>[] }) {
  const { userId, notify, sync } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const photos = media.filter((v) => v.resource.type.coding[0].code === "image");

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";                      // lets the same photo be chosen again
    if (!file || busy) return;
    setBusy(true); setProblem(undefined);
    try {
      const { bytes, contentType } = await compressImage(file);
      await addMedia(userId, patientId, "photo", contentType, bytes);
      notify(); void sync();
    } catch (err) { setProblem(messageOf(err)); } finally { setBusy(false); }
  }
  async function mistake(id: string) { try { await markMediaInError(userId, id); notify(); void sync(); } catch (e) { setProblem(messageOf(e)); } }

  return (<>
    <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={picked} aria-label="Choose a photo" />
    <button className="photo-tile" disabled={busy} onClick={() => input.current?.click()}>
      <Icon name="camera" />
      {busy ? "Preparing photo…" : "Take photo"}
    </button>
    {problem && <Alert>{problem}</Alert>}
    {photos.map((v) => <MediaRow key={v.resource.id} v={v} onMistake={mistake} />)}
  </>);
}

export function VoiceSection({ patientId, media }: { patientId: string; media: View<Media>[] }) {
  const { userId, notify, sync } = useData();
  const rec = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const [state, setState] = useState<"idle" | "starting" | "recording" | "saving">("idle");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<string>();
  const notes = media.filter((v) => v.resource.type.coding[0].code === "audio");

  useEffect(() => () => { clearInterval(timer.current); rec.current?.cancel(); }, []);   // leaving the page stops the microphone

  async function start() {
    if (state !== "idle") return;
    setProblem(undefined); setState("starting");
    try {
      rec.current = await startRecording();
      setSeconds(0); setState("recording");
      timer.current = setInterval(() => setSeconds((s) => { if (s + 1 >= MAX_SECONDS) void stop(); return s + 1; }), 1000);
    } catch (e) { setProblem(messageOf(e)); setState("idle"); }
  }
  async function stop() {
    const r = rec.current;
    if (!r) return;
    rec.current = null; clearInterval(timer.current);
    setState("saving");
    try {
      const { bytes, contentType } = await r.stop();
      await addMedia(userId, patientId, "voice", contentType, bytes);
      notify(); void sync();
    } catch (e) { setProblem(messageOf(e)); } finally { setState("idle"); }
  }
  function cancel() { clearInterval(timer.current); rec.current?.cancel(); rec.current = null; setState("idle"); }
  async function mistake(id: string) { try { await markMediaInError(userId, id); notify(); void sync(); } catch (e) { setProblem(messageOf(e)); } }

  return (<>
    <div className="row">
      {state === "recording" ? <MicButton recording seconds={seconds} onClick={stop} /> : <MicButton onClick={start} disabled={state !== "idle"} />}
      <span className="caption">{state === "recording" ? "Recording. Tap to finish." : state === "saving" ? "Saving…" : state === "starting" ? "Starting…" : "Record a voice note (up to 2 minutes)"}</span>
      {state === "recording" && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}
    </div>
    {problem && <Alert>{problem}</Alert>}
    {notes.map((v) => <MediaRow key={v.resource.id} v={v} onMistake={mistake} />)}
  </>);
}
