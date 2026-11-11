import type { Session } from "../auth/types";
import type { Priority } from "../components/clinical";

export type DangerSign = { id: string; label: string; tier: Exclude<Priority, "routine"> };
/** The same list as the server (backend/src/routes/referrals.ts). */
export const DANGER_SIGNS: DangerSign[] = [
  { id: "unconscious", label: "Not responding", tier: "emergency" },
  { id: "convulsions", label: "Convulsions", tier: "emergency" },
  { id: "breathing_difficulty", label: "Struggling to breathe", tier: "emergency" },
  { id: "severe_bleeding", label: "Heavy bleeding", tier: "emergency" },
  { id: "fever_with_rash", label: "Fever with rash", tier: "urgent" },
  { id: "severe_dehydration", label: "Severe dehydration", tier: "urgent" },
  { id: "severe_pain", label: "Severe pain", tier: "urgent" },
  { id: "persistent_vomiting", label: "Vomiting that won't stop", tier: "soon" },
  { id: "not_eating", label: "Not eating or drinking", tier: "soon" },
];
export type VitalReadings = Partial<Record<"systolic" | "diastolic" | "temperature", number>>;

export type Suggestion = { priority: Priority; reason: string; note: string };
export type CareEvent = { kind: string; level: number | null; who: string | null; notified: string | null; message: string; at: string; delivery: "logged_only" };
export type Referral = {
  id: string; patient: { id: string; name: string }; reason: string; priority: Priority; priorityReason: string | null;
  status: "pending" | "accepted" | "completed" | "declined" | "cancelled"; from: string; to: string; sentAt: string;
  relation: "received" | "sent"; actions: string[]; events?: CareEvent[];
};
export type Emergency = {
  id: string; patient: { id: string; name: string } | null; description: string; location: string | null;
  status: "raised" | "acknowledged" | "resolved" | "cancelled"; level: number; raisedAt: string; raisedBy: string;
  acknowledgedBy: string | null; acknowledgedAt: string | null; nextEscalationAt: string | null; actions: string[]; events?: CareEvent[];
};
export type NewReferral = { id: string; patient: { id: string; name: string }; to: { id: string; name: string }; reason: string; priority?: Priority; signs: string[]; vitals: VitalReadings };
export type NewEmergency = { id: string; patientId?: string; description: string; location?: string };

export const NO_CONNECTION = "No connection right now.";

export class CareError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "CareError"; }
}

/** The same calls against the real API (SVC-7) or the test-mode stand-in. */
export interface CareApi {
  suggest(signs: string[], vitals: VitalReadings): Promise<Suggestion>;
  refer(input: NewReferral): Promise<Referral>;
  referrals(): Promise<Referral[]>;
  referral(id: string): Promise<Referral>;
  actOnReferral(id: string, action: string): Promise<Referral>;
  raise(input: NewEmergency): Promise<Emergency>;
  emergencies(): Promise<Emergency[]>;
  emergency(id: string): Promise<Emergency>;
  actOnEmergency(id: string, action: string): Promise<Emergency>;
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function httpCareApi(token: string, baseUrl = API_URL): CareApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      throw new CareError("offline", NO_CONNECTION);
    }
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new CareError(data.error ?? "error", data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    suggest: (danger_signs, vitals) => call("POST", "/referrals/suggest", { danger_signs, vitals }),
    refer: (i) => call("POST", "/referrals", { id: i.id, patient_id: i.patient.id, to_practitioner_id: i.to.id, reason: i.reason, danger_signs: i.signs, vitals: i.vitals, ...(i.priority ? { priority: i.priority } : {}) }),
    referrals: () => call("GET", "/referrals/mine"),
    referral: (id) => call("GET", `/referrals/${id}`),
    actOnReferral: (id, action) => call("POST", `/referrals/${id}/${action}`, {}),
    raise: (i) => call("POST", "/emergencies", { id: i.id, description: i.description, ...(i.patientId ? { patient_id: i.patientId } : {}), ...(i.location ? { location_note: i.location } : {}) }),
    emergencies: () => call("GET", "/emergencies/mine"),
    emergency: (id) => call("GET", `/emergencies/${id}`),
    actOnEmergency: (id, action) => call("POST", `/emergencies/${id}/${action}`, {}),
  };
}

/* ---------------- Test mode ---------------- */

const ORDER: Priority[] = ["emergency", "urgent", "soon", "routine"];
const LIMITS: Record<keyof VitalReadings, { label: string; unit: string; emergency: [number, number]; urgent: [number, number]; soon: [number, number] }> = {
  systolic: { label: "top blood pressure", unit: "mmHg", emergency: [70, 220], urgent: [80, 180], soon: [0, 140] },
  diastolic: { label: "bottom blood pressure", unit: "mmHg", emergency: [40, 130], urgent: [50, 120], soon: [0, 90] },
  temperature: { label: "temperature", unit: "°C", emergency: [34, 41], urgent: [35, 39.5], soon: [0, 37.5] },
};
const NOTE = "A suggestion from example rules, not a diagnosis";
const rule = (signs: string[], vitals: VitalReadings): Suggestion => {
  for (const tier of ["emergency", "urgent", "soon"] as const) {
    const why = DANGER_SIGNS.filter((s) => s.tier === tier && signs.includes(s.id)).map((s) => s.label.toLowerCase());
    for (const [name, value] of Object.entries(vitals) as [keyof VitalReadings, number][]) {
      if (value < LIMITS[name][tier][0] || value >= LIMITS[name][tier][1]) why.push(`${LIMITS[name].label} ${value} ${LIMITS[name].unit}`);
    }
    if (why.length) return { priority: tier, reason: `Suggested ${tier}: ${why.join("; ")}`, note: NOTE };
  }
  return { priority: "routine", reason: "Suggested routine: no danger signs or out-of-range readings entered", note: NOTE };
};

const ESCALATE_MINUTES = 5, LAST_LEVEL = 3, MINUTE = 60_000;
const KEY = "hc.mock.care.v1";
type StoredR = Omit<Referral, "relation" | "actions"> & { events: CareEvent[]; fromId: string; toId: string };
type StoredE = Omit<Emergency, "actions" | "nextEscalationAt"> & { events: CareEvent[]; raisedById: string };
type Store = { referrals: StoredR[]; emergencies: StoredE[] };
const load = (): Store => { try { return JSON.parse(localStorage.getItem(KEY) ?? "") as Store; } catch { return { referrals: [], emergencies: [] }; } };
const save = (s: Store) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } };
const event = (kind: string, message: string, notified: string, who: string | null = null, level: number | null = null, at = new Date().toISOString()): CareEvent => ({ kind, level, who, notified, message, at, delivery: "logged_only" });
const LADDER = ["Nurses at your facility (test)", "Doctors at your facility (test)", "Health centre admin (test)", "Ghana Health Service (test)"];

/** Test mode: the server's rules, kept on this device. One demo clinician stands for every doctor and nurse, so they see it at once. */
export function mockCareApi(session: Session): CareApi {
  const { user } = session;
  const responder = ["clinician", "facility_admin", "ghs"].includes(user.role);
  const refers = user.role === "chv" || user.role === "clinician";
  const settle = (s: Store) => {
    let changed = false;
    for (const e of s.emergencies) {
      if (e.status !== "raised") continue;
      const due = Math.min(LAST_LEVEL, Math.floor((Date.now() - Date.parse(e.raisedAt)) / (ESCALATE_MINUTES * MINUTE)));
      for (let level = e.level + 1; level <= due; level++) {
        e.events.push(event("escalated", `Not acknowledged after ${level * ESCALATE_MINUTES} minutes: ${e.description}`, LADDER[level], null, level, new Date(Date.parse(e.raisedAt) + level * ESCALATE_MINUTES * MINUTE).toISOString()));
        e.level = level; changed = true;
      }
    }
    if (changed) save(s);
  };
  const sees = (e: StoredE) => e.raisedById === user.id || user.role === "clinician" || (user.role === "facility_admin" && e.level >= 2) || (user.role === "ghs" && e.level >= 3);
  const eview = (e: StoredE): Emergency => {
    const actions: string[] = [];
    if (responder && e.raisedById !== user.id && e.status === "raised") actions.push("acknowledge");
    if (responder && e.status === "acknowledged") actions.push("resolve");
    if (e.raisedById === user.id && (e.status === "raised" || e.status === "acknowledged")) actions.push("cancel");
    return { ...e, actions, nextEscalationAt: e.status === "raised" && e.level < LAST_LEVEL ? new Date(Date.parse(e.raisedAt) + (e.level + 1) * ESCALATE_MINUTES * MINUTE).toISOString() : null };
  };
  const rview = (r: StoredR): Referral => {
    const actions = r.toId === user.id ? (r.status === "pending" ? ["accept", "decline"] : r.status === "accepted" ? ["complete"] : []) : r.fromId === user.id && r.status === "pending" ? ["cancel"] : [];
    return { ...r, relation: r.toId === user.id ? "received" : "sent", actions };
  };
  const findR = (s: Store, id: string) => {
    const r = s.referrals.find((x) => x.id === id);
    if (!r) throw new CareError("not_found", "Unknown referral.");
    if (r.toId !== user.id && r.fromId !== user.id) throw new CareError("forbidden", "This referral is not yours.");
    return r;
  };
  const findE = (s: Store, id: string) => {
    settle(s);
    const e = s.emergencies.find((x) => x.id === id);
    if (!e) throw new CareError("not_found", "Unknown emergency.");
    if (!sees(e)) throw new CareError("forbidden", "This emergency has not reached you.");
    return e;
  };
  return {
    async suggest(signs, vitals) { if (!refers) throw new CareError("forbidden", `A ${user.role} account cannot refer patients.`); return rule(signs, vitals); },
    async refer(i) {
      if (!refers) throw new CareError("forbidden", `A ${user.role} account cannot refer patients.`);
      const s = load();
      const again = s.referrals.find((r) => r.id === i.id);
      if (again) return rview(again);
      const suggestion = rule(i.signs, i.vitals);
      const priority = i.priority ?? suggestion.priority;
      if (suggestion.priority === "emergency" && priority !== "emergency") throw new CareError("cannot_lower_emergency", "A suggested emergency cannot be lowered.");
      const why = priority === suggestion.priority ? suggestion.reason : `${suggestion.reason}. Changed to ${priority} by the person referring`;
      const r: StoredR = { id: i.id, patient: i.patient, reason: i.reason, priority, priorityReason: why, status: "pending", from: user.name, to: i.to.name, sentAt: new Date().toISOString(), fromId: user.id, toId: i.to.id, events: [event("sent", `New ${priority} referral: ${i.reason}. ${why}`, i.to.name, user.name)] };
      s.referrals.push(r); save(s);
      return rview(r);
    },
    async referrals() {
      if (!refers) throw new CareError("forbidden", `A ${user.role} account has no referrals.`);
      return load().referrals
        .filter((r) => (r.toId === user.id && (r.status === "pending" || r.status === "accepted")) || r.fromId === user.id)
        .sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority) || a.sentAt.localeCompare(b.sentAt)).map(({ events: _e, ...r }) => rview({ ...r, events: [] }));
    },
    async referral(id) { return rview(findR(load(), id)); },
    async actOnReferral(id, action) {
      const s = load(), r = findR(s, id);
      if (!rview(r).actions.includes(action)) throw new CareError(r.toId === user.id || r.fromId === user.id ? "wrong_status" : "forbidden", `This is already ${r.status}.`);
      const to = ({ accept: "accepted", decline: "declined", complete: "completed", cancel: "cancelled" } as const)[action as "accept"];
      r.status = to; r.events.push(event(to, `Referral ${to}.`, r.toId === user.id ? r.from : r.to, user.name));
      save(s); return rview(r);
    },
    async raise(i) {
      if (!refers) throw new CareError("forbidden", `A ${user.role} account cannot raise an emergency.`);
      const s = load();
      const again = s.emergencies.find((e) => e.id === i.id);
      if (again) return eview(again);
      const e: StoredE = { id: i.id, patient: i.patientId ? { id: i.patientId, name: "This patient" } : null, description: i.description, location: i.location ?? null, status: "raised", level: 0, raisedAt: new Date().toISOString(), raisedBy: user.name, raisedById: user.id, acknowledgedBy: null, acknowledgedAt: null, events: [event("raised", i.description, LADDER[0], user.name, 0)] };
      s.emergencies.push(e); save(s);
      return eview(e);
    },
    async emergencies() {
      const s = load(); settle(s);
      return s.emergencies.filter((e) => sees(e) && (e.status === "raised" || e.status === "acknowledged"))
        .sort((a, b) => Number(b.status === "raised") - Number(a.status === "raised") || b.level - a.level || a.raisedAt.localeCompare(b.raisedAt)).map(eview);
    },
    async emergency(id) { return eview(findE(load(), id)); },
    async actOnEmergency(id, action) {
      const s = load(), e = findE(s, id);
      if (!eview(e).actions.includes(action)) throw new CareError(e.raisedById === user.id && action === "acknowledge" ? "forbidden" : "wrong_status", e.raisedById === user.id && action === "acknowledge" ? "Someone else has to acknowledge an emergency you raised." : `This is already ${e.status}.`);
      const kind: Emergency["status"] = ({ acknowledge: "acknowledged", resolve: "resolved", cancel: "cancelled" } as Record<string, Emergency["status"]>)[action];
      e.status = kind;
      if (kind === "acknowledged") { e.acknowledgedBy = user.name; e.acknowledgedAt = new Date().toISOString(); }
      e.events.push(event(kind, `Emergency ${kind}.`, e.raisedBy, user.name));
      save(s); return eview(e);
    },
  };
}

export const careApiFor = (session: Session): CareApi => (session.mode === "live" ? httpCareApi(session.token) : mockCareApi(session));
