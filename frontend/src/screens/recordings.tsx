import { useEffect, useMemo, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { StateView } from "../components/display";
import { Field } from "../components/inputs";
import { useSession } from "../auth/Session";
import type { CallApi, CallState, RecordingResult } from "../call/engine";
import { useData, useLoad } from "../data/DataProvider";
import { newId } from "../data/model";
import { RecordingError, keepRecording, openRecording, recordingApiFor, type RecordingApi, type RecordingReview, type RecordingRow } from "../data/recordings";
import { KV, TestMode, type ScreenDef } from "./kit";

const WHERE = "Sound only. It stays encrypted on the doctor's phone and is not uploaded anywhere.";
const messageOf = (e: unknown) => (e instanceof RecordingError ? e.message : "We couldn't do that. Please try again.");

/**
 * After a recording ends, on the doctor's phone. A yes must be on file before anything is kept: if the server
 * refuses the recording it is dropped, but if the server just can't be reached the sound is kept and we say so.
 */
export async function settleRecording(userId: string, recApi: RecordingApi, r: RecordingResult): Promise<string> {
  if (r.outcome !== "finished" || !r.bytes) { await recApi.withdraw(r.id).catch(() => undefined); return r.outcome === "failed" ? "Nothing was recorded." : ""; }
  let note = "The recording is saved, encrypted, on this phone only. It has not been uploaded.";
  try {
    await recApi.finish(r.id, r.seconds);
  } catch (e) {
    if (e instanceof RecordingError && e.code !== "offline") return "The server refused this recording, so it was deleted.";
    note = "The recording is saved, encrypted, on this phone only. The quality list could not be updated, so it can't be reviewed.";
  }
  try { await keepRecording(userId, r.id, r.bytes, r.contentType ?? "audio/webm"); }
  catch { return "The recording couldn't be saved on this phone, so it is gone. Is the phone locked?"; }
  return note;
}

/** The consent controls in a call. Only a visit booked in the app can be recorded, and only the doctor's phone records. */
export function RecordingBar({ api, state, recApi, isDoctor, appointmentId, onDone }: { api: CallApi; state: CallState; recApi: RecordingApi; isDoctor: boolean; appointmentId: string; onDone: (r: RecordingResult) => void }) {
  const { rec, phase } = state;
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function ask() {
    setProblem(undefined); setBusy(true);
    const id = newId();
    try {
      await recApi.agree(id, appointmentId);                    // our yes is on file before the other person sees the question
      if (!api.askToRecord(id, onDone)) await recApi.withdraw(id);
    } catch (e) { setProblem(messageOf(e)); } finally { setBusy(false); }
  }
  async function agree() {
    if (rec.status !== "asked") return;
    setProblem(undefined); setBusy(true);
    try { await recApi.agree(rec.id, appointmentId); api.agreeToRecord(); }
    catch (e) { setProblem(messageOf(e)); api.withdrawRecording(); }
    finally { setBusy(false); }
  }
  function withdraw() {
    if (rec.status === "off") return;
    const id = rec.id;
    api.withdrawRecording();                                     // stops here first; the server is only told afterwards
    void recApi.withdraw(id).catch(() => undefined);
  }

  const alert = problem && <p className="caption" role="alert">{problem}</p>;
  if (rec.status === "asked") return (
    <div className="call-suggest" role="alert">
      <span className="body-strong">The doctor would like to record this visit.</span>
      <span className="caption">{WHERE} If you are with the patient, ask them first. A health centre admin may check that the visit met the standard. Either of you can stop at any time, and if you do, the recording is deleted.</span>
      {alert}
      <div className="row">
        <PrimaryButton loading={busy} onClick={() => void agree()}>Yes, record</PrimaryButton>
        <SecondaryButton onClick={withdraw}>No</SecondaryButton>
      </div>
    </div>
  );
  if (rec.status === "asking") return (
    <div className="call-suggest" role="status">
      <span>Waiting for the other person to agree. Nothing is being recorded.</span>
      <SecondaryButton onClick={withdraw}>Stop asking</SecondaryButton>
    </div>
  );
  if (rec.status === "on") return (
    <div className="call-suggest" role="status">
      <span className="caption">{WHERE}</span>
      <SecondaryButton onClick={withdraw}>Stop and delete recording</SecondaryButton>
    </div>
  );
  if (!isDoctor || phase !== "connected") return alert || null;
  return (<>
    {alert}
    <div style={{ position: "relative", zIndex: 3 }}><SecondaryButton disabled={busy} onClick={() => void ask()}>Ask to record this visit</SecondaryButton></div>
  </>);
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "No");
const STATUS: Record<RecordingRow["status"], string> = { open: "Not finished", finished: "Finished", withdrawn: "Withdrawn, recording deleted" };
const OUTCOME: Record<RecordingReview["outcome"], string> = { meets_standard: "Meets the standard", needs_follow_up: "Needs follow-up" };

/** Decrypts only when asked, and frees the address when done. */
function Play({ id }: { id: string }) {
  const { userId } = useData();
  const [url, setUrl] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (missing) return <p className="caption">This recording isn't on this phone.</p>;
  if (url) return <audio controls src={url} aria-label="Play recording" />;
  return <TextButton onClick={() => void openRecording(userId, id).then((s) => { if (!s) return setMissing(true); setUrl(URL.createObjectURL(new Blob([s.bytes as BlobPart], { type: s.contentType }))); })}>Play on this phone</TextButton>;
}

function Row({ r, api, onSaved }: { r: RecordingRow; api: RecordingApi; onSaved: () => void }) {
  const [outcome, setOutcome] = useState<RecordingReview["outcome"]>();
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();
  async function save() {
    if (!outcome) return;
    try { await api.review(r.id, outcome, note.trim()); onSaved(); } catch (e) { setProblem(messageOf(e)); }
  }
  return (
    <div className="stack" style={{ borderTop: "var(--border-hair) solid var(--mist)", paddingTop: "var(--space-3)" }}>
      <KV k="Doctor" v={r.doctor} />
      <KV k="Recorded" v={fmt(r.askedAt)} />
      {r.seconds !== null && <KV k="Length" v={`${Math.floor(r.seconds / 60)} min ${r.seconds % 60} s`} />}
      <KV k="Status" v={STATUS[r.status]} />
      <KV k="Doctor agreed" v={fmt(r.clinicianAgreedAt)} />
      <KV k="Patient's side agreed" v={fmt(r.patientAgreedAt)} />
      {r.status === "finished" && <p className="caption">Where it is: encrypted on {r.doctor}'s phone only. Not uploaded.</p>}
      {r.onThisDoctorsPhone && r.status === "finished" && <Play id={r.id} />}
      {r.reviews.map((v) => <p key={v.reviewer} className="caption">Reviewed by {v.reviewer}, {fmt(v.at)}: {OUTCOME[v.outcome]}{v.note ? `. ${v.note}` : ""}</p>)}
      {r.mayReview && <>
        <p className="caption">You can review this. To hear it, listen on {r.doctor}'s phone with them; the sound cannot come to you.</p>
        <div className="row">{(Object.keys(OUTCOME) as RecordingReview["outcome"][]).map((o) => <Chip key={o} selected={outcome === o} onClick={() => setOutcome(o)}>{OUTCOME[o]}</Chip>)}</div>
        <Field label="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} helper="Don't write the patient's name" />
        {problem && <p className="caption" role="alert">{problem}</p>}
        <PrimaryButton disabled={!outcome} onClick={() => void save()}>Save review</PrimaryButton>
      </>}
    </div>
  );
}

export function RecordingList() {
  const { session } = useSession();
  const api = useMemo(() => recordingApiFor(session!), [session]);
  const [again, setAgain] = useState(0);
  const list = useLoad(() => api.list(), [api, again]);
  const admin = session?.user.role === "facility_admin";
  return (<>
    <p>{admin
      ? "You can review finished recordings of doctors at your health centre. Recordings someone withdrew never appear here. Each review is saved under your name."
      : "Recordings of your visits. A health centre admin at your facility can review the finished ones. You can't review your own."}</p>
    <p className="caption">Only these details are on the server. The sound stays on the doctor's phone, encrypted, until the secure upload is built. If that phone is wiped, the sound is gone.</p>
    {list.loading ? <StateView kind="loading" text="Loading…" /> : list.error ? <StateView kind="error" text={list.error} />
      : (list.data ?? []).length === 0 ? <StateView kind="empty" text="No recordings yet." />
      : <div className="stack">{(list.data ?? []).map((r) => <Row key={r.id} r={r} api={api} onSaved={() => setAgain((n) => n + 1)} />)}</div>}
    {session?.mode !== "live" && <TestMode what="This list" />}
  </>);
}

export const recordingScreens: Record<string, ScreenDef> = {
  "clinician.recordings": { title: "Recorded visits", render: () => <RecordingList /> },
  "facility.qa": { title: "Quality review", caption: "Recorded visits", render: () => <RecordingList /> },
};
