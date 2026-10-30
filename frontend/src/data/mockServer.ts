import { NetworkError, type PushRequest, type PushResult, type SyncApi } from "./sync";
import type { Resource } from "./model";

type Stored = { version: number; resource: Resource };

/** A stand-in for patient-record-service that follows the rules in D-011:
 *  same id and same data = already stored (200); same id and different data on a stale version = conflict (409).
 *  Test switches let a demo or a test make the network fail or lose a reply. */
export class MockServer implements SyncApi {
  readonly store = new Map<string, Stored>();
  reachable = true;
  loseNextReply = false;       // the change is stored, but the phone never hears back
  pushes = 0;                  // how many requests actually reached the server

  /** With a key, the "server" survives a page reload, so a demo can be done across sessions. */
  constructor(private persistKey?: string) {
    if (!persistKey) return;
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) for (const [id, v] of JSON.parse(raw) as [string, Stored][]) this.store.set(id, v);
    } catch { /* unreadable: start empty */ }
  }
  private save() {
    if (this.persistKey) try { localStorage.setItem(this.persistKey, JSON.stringify([...this.store])); } catch { /* storage full or blocked */ }
  }

  async push(req: PushRequest): Promise<PushResult> {
    if (!this.reachable) throw new NetworkError();
    this.pushes++;
    const result = this.apply(req);
    this.save();
    if (this.loseNextReply) { this.loseNextReply = false; throw new NetworkError("Reply lost"); }
    return result;
  }

  private apply(req: PushRequest): PushResult {
    if (req.resourceType !== "Patient" && req.patientId && !this.store.has(req.patientId)) {
      return { status: "retry", reason: "patient-not-here-yet" };
    }
    const have = this.store.get(req.id);
    if (!have) {
      this.store.set(req.id, { version: 1, resource: req.resource });
      return { status: "ok", serverVersion: 1 };
    }
    if (JSON.stringify(have.resource) === JSON.stringify(req.resource)) return { status: "duplicate", serverVersion: have.version };
    if (req.baseVersion === have.version) {
      this.store.set(req.id, { version: have.version + 1, resource: req.resource });
      return { status: "ok", serverVersion: have.version + 1 };
    }
    return { status: "conflict", serverVersion: have.version, resource: have.resource };
  }

  /** Pretends another phone changed the record. */
  editElsewhere(id: string, change: (r: Resource) => Resource) {
    const have = this.store.get(id);
    if (!have) throw new Error("not on the server");
    this.store.set(id, { version: have.version + 1, resource: change(have.resource) });
    this.save();
  }
}
