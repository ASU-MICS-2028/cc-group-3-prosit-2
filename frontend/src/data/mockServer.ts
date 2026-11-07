import { NetworkError, type PullPage, type PushRequest, type PushResult, type SyncApi } from "./sync";
import { appointmentPatientId, appointmentPractitionerId, type Appointment, type Resource } from "./model";

/** `seq`, `owner` and `patientId` are filled in by the server; older entries without them still work. */
type Stored = { version: number; resource: Resource; seq?: number; owner?: string | null; patientId?: string | null };
export type Actor = { userId: string; role: string };

const PAGE = 100;

/** A stand-in for patient-record-service that follows the rules in D-011 and D-017:
 *  same id and same data = already stored (200); same id and different data on a stale version = conflict (409);
 *  two booked visits for one specialist at the same time = refused for good (409 double_booked).
 *  What each role may download is decided here, as the real server must (the app only hides things). */
export class MockServer implements SyncApi {
  readonly store = new Map<string, Stored>();
  reachable = true;
  loseNextReply = false;       // the change is stored, but the phone never hears back
  pushes = 0;                  // how many requests actually reached the server
  private seq = 0;

  /** With a key, the "server" survives a page reload, so a demo can be done across sessions. */
  constructor(private persistKey?: string) {
    if (!persistKey) return;
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw) as { seq?: number; entries: [string, Stored][] } | [string, Stored][];
        const entries = Array.isArray(saved) ? saved : saved.entries;
        for (const [id, v] of entries) this.store.set(id, v);
        this.seq = Array.isArray(saved) ? 0 : (saved.seq ?? 0);
      }
    } catch { /* unreadable: start empty */ }
  }
  private save() {
    if (this.persistKey) try { localStorage.setItem(this.persistKey, JSON.stringify({ seq: this.seq, entries: [...this.store] })); } catch { /* storage full or blocked */ }
  }
  clear() { this.store.clear(); this.seq = 0; if (this.persistKey) localStorage.removeItem(this.persistKey); }

  /** The server as one signed-in person sees it. */
  as(actor: Actor): SyncApi & { taken(specialistId: string, fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> } {
    return {
      push: (req) => this.pushAs(req, actor),
      pull: (since) => this.pullAs(since, actor),
      taken: async (id, from, to) => { if (!this.reachable) throw new NetworkError(); return this.taken(id, from, to); },
    };
  }

  push(req: PushRequest): Promise<PushResult> { return this.pushAs(req, null); }

  private async pushAs(req: PushRequest, actor: Actor | null): Promise<PushResult> {
    if (!this.reachable) throw new NetworkError();
    this.pushes++;
    const result = this.apply(req, actor);
    this.save();
    if (this.loseNextReply) { this.loseNextReply = false; throw new NetworkError("Reply lost"); }
    return result;
  }

  private put(id: string, version: number, resource: Resource, owner: string | null | undefined, patientId: string | null) {
    this.store.set(id, { version, resource, seq: ++this.seq, owner, patientId });
  }

  private apply(req: PushRequest, actor: Actor | null): PushResult {
    if (req.resourceType !== "Patient" && req.patientId && !this.store.has(req.patientId)) return { status: "retry", reason: "patient-not-here-yet" };
    const have = this.store.get(req.id);
    if (!have) {
      const clash = this.doubleBooked(req);
      if (clash) return clash;
      this.put(req.id, 1, req.resource, actor?.userId ?? null, req.patientId);
      return { status: "ok", serverVersion: 1 };
    }
    if (JSON.stringify(have.resource) === JSON.stringify(req.resource)) return { status: "duplicate", serverVersion: have.version };
    if (req.baseVersion === have.version) {
      const clash = this.doubleBooked(req);
      if (clash) return clash;
      this.put(req.id, have.version + 1, req.resource, have.owner, req.patientId);
      return { status: "ok", serverVersion: have.version + 1 };
    }
    return { status: "conflict", serverVersion: have.version, resource: have.resource };
  }

  private doubleBooked(req: PushRequest): PushResult | null {
    const a = req.resource;
    if (a.resourceType !== "Appointment" || a.status !== "booked") return null;
    const who = appointmentPractitionerId(a);
    for (const [id, s] of this.store) {
      const o = s.resource;
      if (id === req.id || o.resourceType !== "Appointment" || o.status !== "booked") continue;
      if (appointmentPractitionerId(o) === who && o.start < a.end && a.start < o.end) return { status: "rejected", reason: "slot-taken" };
    }
    return null;
  }

  private taken(specialistId: string, fromIso: string, toIso: string) {
    const out: { start: string; end: string }[] = [];
    for (const s of this.store.values()) {
      const a = s.resource;
      if (a.resourceType === "Appointment" && a.status === "booked" && appointmentPractitionerId(a) === specialistId && a.start < toIso && fromIso < a.end) out.push({ start: a.start, end: a.end });
    }
    return out;
  }

  /** Who may see which record. A person always sees what they created; a CHV also sees what others added about
   *  their patients; a clinician sees the visits booked with them and the records of those patients. */
  private visibleTo(actor: Actor): Set<string> {
    const patientsOf = new Set<string>();
    for (const [id, s] of this.store) {
      if (s.resource.resourceType === "Patient" && s.owner === actor.userId && actor.role === "chv") patientsOf.add(id);
      if (actor.role === "clinician" && s.resource.resourceType === "Appointment" && appointmentPractitionerId(s.resource) === actor.userId) patientsOf.add(appointmentPatientId(s.resource));
    }
    return patientsOf;
  }

  private async pullAs(since: number, actor: Actor): Promise<PullPage> {
    if (!this.reachable) throw new NetworkError();
    const patients = this.visibleTo(actor);
    const items = [...this.store]
      .filter(([, s]) => (s.seq ?? 0) > since)
      .filter(([id, s]) => s.owner === actor.userId || (actor.role === "patient" && s.patientId === actor.userId) || (s.patientId != null && patients.has(s.patientId)) || patients.has(id) || (actor.role === "clinician" && s.resource.resourceType === "Appointment" && appointmentPractitionerId(s.resource as Appointment) === actor.userId))
      .sort((a, b) => (a[1].seq ?? 0) - (b[1].seq ?? 0));
    const page = items.slice(0, PAGE);
    const cursor = page.length ? (page[page.length - 1][1].seq ?? since) : (items.length === 0 ? Math.max(since, this.seq) : since);
    return { items: page.map(([id, s]) => ({ id, resourceType: s.resource.resourceType, patientId: s.patientId ?? null, version: s.version, resource: s.resource })), cursor, more: items.length > PAGE };
  }

  /** Pretends another phone changed the record. */
  editElsewhere(id: string, change: (r: Resource) => Resource) {
    const have = this.store.get(id);
    if (!have) throw new Error("not on the server");
    this.store.set(id, { ...have, version: have.version + 1, resource: change(have.resource), seq: ++this.seq });
    this.save();
  }
}
