import type { Session } from "../auth/types";
import { fromBase64, toBase64 } from "./model";
import { get, put, transact } from "./db";
import { audit } from "./repo";
import { open, seal, type Sealed } from "./vault";

export type RecordingReview = { reviewer: string; outcome: "meets_standard" | "needs_follow_up"; note: string | null; at: string };
export type RecordingRow = {
  id: string; doctor: string; facility: string | null; status: "open" | "finished" | "withdrawn"; askedAt: string; endedAt: string | null; seconds: number | null;
  clinicianAgreedAt: string | null; patientAgreedAt: string | null; withdrawnAt: string | null; mayReview: boolean; onThisDoctorsPhone: boolean; reviews: RecordingReview[];
};

export class RecordingError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "RecordingError"; }
}

/** Consent and review facts only. There is deliberately no call here that carries the sound. */
export interface RecordingApi {
  agree(id: string, appointmentId: string): Promise<unknown>;
  withdraw(id: string): Promise<void>;
  finish(id: string, seconds: number): Promise<void>;
  list(): Promise<RecordingRow[]>;
  review(id: string, outcome: RecordingReview["outcome"], note: string): Promise<unknown>;
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function httpRecordingApi(token: string, baseUrl = API_URL): RecordingApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      throw new RecordingError("offline", "No connection, so this couldn't be saved.");
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new RecordingError(data.error ?? "error", data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    agree: (id, appointmentId) => call("POST", `/recordings/${id}/agree`, { appointment_id: appointmentId }),
    withdraw: (id) => call("POST", `/recordings/${id}/withdraw`, {}),
    finish: (id, seconds) => call("POST", `/recordings/${id}/finish`, { seconds }),
    list: () => call("GET", "/recordings"),
    review: (id, outcome, note) => call("POST", `/recordings/${id}/review`, { outcome, note }),
  };
}

const KEY = "hc.mock.recordings.v1";
type Stored = RecordingRow & { doctorId: string };
const load = (): Stored[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Stored[]; } catch { return []; } };
const store = (all: Stored[]) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ } };

/** Test mode: the server's rules (backend/src/routes/recordings.ts) as far as one device can keep them. */
export function mockRecordingApi(session: Session): RecordingApi {
  const { user } = session;
  const change = (id: string, fn: (r: Stored) => void) => { const all = load(), r = all.find((x) => x.id === id); if (!r) throw new RecordingError("not_found", "Unknown recording."); fn(r); store(all); };
  const statusAfter = (r: Stored) => { r.status = r.withdrawnAt ? "withdrawn" : r.endedAt ? "finished" : "open"; };
  return {
    async agree(id) {
      const now = new Date().toISOString();
      const all = load();
      if (user.role !== "clinician") return;   // this mock lives on one phone, so the other phone's yes can't be stored here
      if (!all.some((r) => r.id === id)) {
        all.push({ id, doctor: user.name, doctorId: user.id, facility: user.facility ?? null, status: "open", askedAt: now, endedAt: null, seconds: null, clinicianAgreedAt: null, patientAgreedAt: null, withdrawnAt: null, mayReview: false, onThisDoctorsPhone: false, reviews: [] });
        store(all);
      }
      change(id, (r) => {
        if (r.withdrawnAt) throw new RecordingError("withdrawn", "This recording was stopped. Ask again to start a new one.");
        r.clinicianAgreedAt ??= now;
      });
    },
    async withdraw(id) { change(id, (r) => { r.withdrawnAt ??= new Date().toISOString(); statusAfter(r); }); },
    async finish(id, seconds) {
      change(id, (r) => {
        if (r.withdrawnAt) throw new RecordingError("withdrawn", "This recording was stopped and must not be kept.");
        r.patientAgreedAt ??= new Date().toISOString();   // test mode: the call itself is the only evidence; the real server refuses without it
        r.endedAt ??= new Date().toISOString(); r.seconds ??= seconds; statusAfter(r);
      });
    },
    async list() {
      const admin = user.role === "facility_admin";
      if (!admin && user.role !== "clinician") throw new RecordingError("forbidden", `A ${user.role} account cannot see recordings.`);
      return load().filter((r) => (admin ? r.status === "finished" : r.doctorId === user.id))
        .map(({ doctorId: _d, ...r }) => ({ ...r, mayReview: admin && !r.reviews.some((v) => v.reviewer === user.name), onThisDoctorsPhone: !admin }));
    },
    async review(id, outcome, note) {
      if (user.role !== "facility_admin") throw new RecordingError("forbidden", `A ${user.role} account cannot review recordings.`);
      change(id, (r) => {
        if (r.status !== "finished") throw new RecordingError("not_reviewable", "Only a finished recording that nobody withdrew can be reviewed.");
        if (!r.reviews.some((v) => v.reviewer === user.name)) r.reviews.push({ reviewer: user.name, outcome, note: note || null, at: new Date().toISOString() });
      });
    },
  };
}

export const recordingApiFor = (session: Session): RecordingApi => (session.mode === "live" ? httpRecordingApi(session.token) : mockRecordingApi(session));

/* ---------- the sound itself: sealed with the vault key, in the phone's "meta" store ---------- */

// Kept out of the "records" store on purpose: anything there is queued for upload to the server by sync.
const keyOf = (id: string) => `recording:${id}`;
type Sound = { contentType: string; data: string };

export async function keepRecording(userId: string, id: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const sealed = await seal(userId, { contentType, data: toBase64(bytes) } satisfies Sound, keyOf(id));
  await transact(userId, ["meta"], "readwrite", (s) => put(s.meta, { key: keyOf(id), sealed }));
}

/** The sound, or undefined if it isn't on this phone. */
export async function openRecording(userId: string, id: string): Promise<{ contentType: string; bytes: Uint8Array } | undefined> {
  const row = await transact(userId, ["meta"], "readonly", (s) => get<{ sealed: Sealed }>(s.meta, keyOf(id)));
  if (!row) return undefined;
  await audit(userId, "read", "Media", id);
  const sound = await open<Sound>(userId, row.sealed, keyOf(id));
  return { contentType: sound.contentType, bytes: fromBase64(sound.data) };
}
