import type { Session } from "../auth/types";
import { consentPurpose, consentWithdrawnAt } from "./model";
import { listConsents } from "./repo";

/** Shown wherever a healer referral appears. The wording is the requirement: not advice, not an endorsement. */
export const HEALER_DISCLAIMER = "A referral to a traditional healer is not medical advice and not an endorsement of any treatment. In an emergency, go to the clinic.";

export type Healer = { id: string; name: string; community: string | null; practice: string | null };
export type Referral = {
  id: string; patient: { id: string; name: string }; reason: string; status: "pending" | "accepted" | "completed" | "declined" | "cancelled"; remedies: string | null;
  from: { id: string; name: string }; to: { id: string; name: string }; direction: "to_healer" | "from_healer"; createdAt: string;
};
export type StockItem = { id: string; name: string; unit: string; quantity: number; reorderLevel: number; low: boolean };
export type Facility = { id: string; name: string };
export type Transfer = { id: string; item: string; unit: string; quantity: number; from: Facility; to: Facility; movedBy: string; at: string };
export type StockView = { synthetic: true; facility: Facility; items: StockItem[]; facilities: Facility[]; lowElsewhere: { facilityId: string; facility: string; item: string; quantity: number; unit: string }[]; transfers: Transfer[] };

export class HealerStockError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "HealerStockError"; }
}

export interface HealerStockApi {
  healers(): Promise<Healer[]>;
  refer(input: { id: string; patient: { id: string; name: string }; healer: Healer; reason: string }): Promise<Referral>;
  referrals(): Promise<Referral[]>;
  answer(id: string, status: "accepted" | "declined" | "completed", remedies?: string): Promise<Referral>;
  referBack(referralId: string, id: string, reason: string): Promise<Referral>;
  stock(): Promise<StockView>;
  stockTake(input: { name: string; unit: string; quantity: number; reorderLevel: number }): Promise<StockItem>;
  moveStock(input: { id: string; itemId: string; toFacilityId: string; quantity: number }): Promise<Transfer>;
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function liveHealerStockApi(session: Session, base = API_URL): HealerStockApi {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch {
      throw new HealerStockError("offline", "No connection. This needs a signal; try again when you have one.");
    }
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new HealerStockError(data.error ?? `http_${res.status}`, data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    healers: async () => (await call<{ healers: Healer[] }>("/healers")).healers,
    refer: (i) => call("/healer-referrals", { id: i.id, patient_id: i.patient.id, healer_id: i.healer.id, reason: i.reason }),
    referrals: () => call("/healer-referrals/mine"),
    answer: (id, status, remedies) => call(`/healer-referrals/${id}/status`, { status, ...(remedies ? { remedies } : {}) }),
    referBack: (referralId, id, reason) => call(`/healer-referrals/${referralId}/refer-back`, { id, reason }),
    stock: () => call("/stock"),
    stockTake: (i) => call("/stock", { name: i.name, unit: i.unit, quantity: i.quantity, reorder_level: i.reorderLevel }),
    moveStock: (i) => call("/stock/transfers", { id: i.id, item_id: i.itemId, to_facility_id: i.toFacilityId, quantity: i.quantity }),
  };
}

/* ---------------- Test mode: same rules as backend/src/routes/healersStock.ts, kept on this device ---------------- */

const REF_KEY = "hc.mock.healer-referrals.v1", STOCK_KEY = "hc.mock.stock.v1";
const read = <T,>(key: string, fallback: T): T => { try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T | null) ?? fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

/** Synthetic: Nana Yaw is the demo healer sign-in; the other two exist only to show a directory. */
const MOCK_HEALERS: Healer[] = [
  { id: "00000000-0000-4000-8000-000000000005", name: "Nana Yaw Asare", community: "Kintampo", practice: "Herbal care (synthetic entry)" },
  { id: "00000000-0000-4000-8000-000000000031", name: "Maame Afia Pokuaa", community: "Techiman", practice: "Herbal care (synthetic entry)" },
  { id: "00000000-0000-4000-8000-000000000032", name: "Togbe Kwasi Dzidzor", community: "Ho", practice: "Bone setting (synthetic entry)" },
];
const FACILITIES: Facility[] = [{ id: "pharmacy", name: "Test pharmacy" }, { id: "clinic", name: "Dodowa clinic" }];
type MockStock = { items: (StockItem & { facilityId: string })[]; transfers: Transfer[] };
const mockItem = (facilityId: string, name: string, unit: string, quantity: number, reorderLevel: number): MockStock["items"][number] =>
  ({ id: `${facilityId}:${name}`, facilityId, name, unit, quantity, reorderLevel, low: false });
const FIRST_STOCK: MockStock = {
  items: [mockItem("pharmacy", "Amlodipine 5 mg", "tablets", 120, 30), mockItem("pharmacy", "Paracetamol 500 mg", "tablets", 14, 50), mockItem("clinic", "ORS sachets", "sachets", 40, 60), mockItem("clinic", "Paracetamol 500 mg", "tablets", 300, 50)],
  transfers: [],
};

export function mockHealerStockApi(session: Session): HealerStockApi {
  const { user } = session;
  const refuse = (code: string, message: string): never => { throw new HealerStockError(code, message); };
  const onlyHealer = () => { if (user.role !== "healer") refuse("forbidden", `A ${user.role} account cannot answer a healer referral.`); };
  const myFacility = (): Facility => {
    if (user.role !== "pharmacist" && user.role !== "facility_admin") refuse("forbidden", `A ${user.role} account cannot manage stock.`);
    return user.role === "pharmacist" ? FACILITIES[0] : FACILITIES[1];
  };
  const withdrawnOf = async (patientId: string) => {
    const all = (await listConsents(user.id, patientId)).map((v) => v.resource).filter((c) => consentPurpose(c) === "healer_referral");
    return { active: all.some((c) => !consentWithdrawnAt(c)), any: all.length > 0 };
  };
  const refs = () => read<Referral[]>(REF_KEY, []);
  const put = (r: Referral) => { write(REF_KEY, [r, ...refs().filter((x) => x.id !== r.id)]); return r; };
  const inbox = (id: string) => { const r = refs().find((x) => x.id === id && x.to.id === user.id); if (!r) refuse("not_found", "That referral is not addressed to you."); return r!; };
  return {
    async healers() { if (!["chv", "clinician", "healer"].includes(user.role)) refuse("forbidden", `A ${user.role} account cannot see the healer directory.`); return MOCK_HEALERS; },
    async refer(i) {
      if (!["chv", "clinician"].includes(user.role)) refuse("forbidden", `A ${user.role} account cannot refer to a healer.`);
      const again = refs().find((r) => r.id === i.id);
      if (again) return again;
      const c = await withdrawnOf(i.patient.id);
      if (!c.active) refuse(c.any ? "consent_withdrawn" : "consent_missing", c.any ? "This patient withdrew their consent for a healer referral." : "This patient has not agreed to a healer referral. Ask them first.");
      return put({ id: i.id, patient: i.patient, reason: i.reason, status: "pending", remedies: null, from: { id: user.id, name: user.name }, to: { id: i.healer.id, name: i.healer.name }, direction: "to_healer", createdAt: new Date().toISOString() });
    },
    async referrals() { return refs().filter((r) => r.from.id === user.id || r.to.id === user.id); },
    async answer(id, status, remedies) {
      onlyHealer();
      const r = inbox(id);
      const allowed: Record<string, string[]> = { pending: ["accepted", "declined"], accepted: ["completed"] };
      if (!allowed[r.status]?.includes(status)) refuse("bad_status", `A ${r.status} referral cannot become ${status}.`);
      return put({ ...r, status, remedies: remedies ?? r.remedies });
    },
    async referBack(referralId, id, reason) {
      onlyHealer();
      const r = inbox(referralId);
      if (r.status !== "accepted" && r.status !== "completed") refuse("bad_status", "Accept the referral before referring back.");
      return put({ ...r, id, reason, status: "pending", remedies: null, from: { id: user.id, name: user.name }, to: r.from, direction: "from_healer", createdAt: new Date().toISOString() });
    },
    async stock() {
      const facility = myFacility();
      const s = read<MockStock>(STOCK_KEY, FIRST_STOCK);
      const low = (i: StockItem) => i.quantity <= i.reorderLevel;
      const mine = s.items.filter((i) => i.facilityId === facility.id);
      return {
        synthetic: true, facility, items: mine.map((i) => ({ ...i, low: low(i) })), facilities: FACILITIES.filter((f) => f.id !== facility.id),
        lowElsewhere: s.items.filter((i) => i.facilityId !== facility.id && low(i) && mine.some((m) => m.name === i.name))
          .map((i) => ({ facilityId: i.facilityId, facility: FACILITIES.find((f) => f.id === i.facilityId)!.name, item: i.name, quantity: i.quantity, unit: i.unit })),
        transfers: s.transfers.filter((t) => t.from.id === facility.id || t.to.id === facility.id),
      };
    },
    async stockTake(i) {
      const facility = myFacility();
      const s = read<MockStock>(STOCK_KEY, FIRST_STOCK);
      const have = s.items.find((x) => x.facilityId === facility.id && x.name === i.name);
      const item = have ? Object.assign(have, { quantity: i.quantity, reorderLevel: i.reorderLevel }) : mockItem(facility.id, i.name, i.unit, i.quantity, i.reorderLevel);
      write(STOCK_KEY, { ...s, items: have ? s.items : [...s.items, item] });
      return { ...item, low: item.quantity <= item.reorderLevel };
    },
    async moveStock(i) {
      const facility = myFacility();
      const s = read<MockStock>(STOCK_KEY, FIRST_STOCK);
      const again = s.transfers.find((t) => t.id === i.id);
      if (again) return again;
      const from = s.items.find((x) => x.id === i.itemId && x.facilityId === facility.id);
      const to = FACILITIES.find((f) => f.id === i.toFacilityId);
      if (!from || !to || to.id === facility.id) return refuse("not_found", "That item or facility was not found.");
      if (i.quantity > from.quantity) refuse("insufficient_stock", "There is not that much in stock to move.");
      let dest = s.items.find((x) => x.facilityId === to.id && x.name === from.name);
      if (!dest) { dest = mockItem(to.id, from.name, from.unit, 0, 0); s.items.push(dest); }
      from.quantity -= i.quantity; dest.quantity += i.quantity;
      const t: Transfer = { id: i.id, item: from.name, unit: from.unit, quantity: i.quantity, from: facility, to, movedBy: user.name, at: new Date().toISOString() };
      write(STOCK_KEY, { items: s.items, transfers: [t, ...s.transfers] });
      return t;
    },
  };
}

export const healerStockApiFor = (session: Session): HealerStockApi => (session.mode === "live" ? liveHealerStockApi(session) : mockHealerStockApi(session));
