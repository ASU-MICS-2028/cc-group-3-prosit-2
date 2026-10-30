import type { ReactNode } from "react";
import { navigate } from "../router";
import { CategoryTile, PersonRow, SyncBadge, type SyncStatus } from "../components/display";
import type { DuotoneName } from "../components/icons";
import type { Day, Slot } from "../components/schedule";

export type ScreenDef = { title: string; caption?: string; render: () => ReactNode };

export const go = (screen: string) => navigate(`/app/${screen}`);

export const Heading = ({ children }: { children: ReactNode }) => <h2 className="heading section-title">{children}</h2>;

export function Tiles({ items }: { items: { icon: DuotoneName; label: string; to: string }[] }) {
  return (
    <div className="tile-grid">
      {items.map((i) => <CategoryTile key={i.to} icon={i.icon} label={i.label} onClick={() => go(i.to)} />)}
    </div>
  );
}

export type Item = { name: string; role: string; hours?: string; trailing?: ReactNode; to?: string };
export function Rows({ items }: { items: Item[] }) {
  return <div className="stack">{items.map((i) => <PersonRow key={i.name + i.role} name={i.name} role={i.role} hours={i.hours} trailing={i.trailing} onClick={i.to ? () => go(i.to!) : undefined} />)}</div>;
}

export const KV = ({ k, v }: { k: string; v: ReactNode }) => <div className="kv"><span className="caption">{k}</span><span className="body-strong">{v}</span></div>;
export const sync = (s: SyncStatus) => <SyncBadge status={s} />;

/** Synthetic calendar and slots, shared by booking screens. */
export const DAYS: Day[] = [
  { key: "mon", weekday: "M", date: 3 }, { key: "tue", weekday: "T", date: 4 }, { key: "wed", weekday: "W", date: 5 },
  { key: "thu", weekday: "T", date: 6 }, { key: "fri", weekday: "F", date: 7 }, { key: "sat", weekday: "S", date: 8 },
];
export const SLOTS: Slot[] = [{ time: "8:00 am" }, { time: "9:30 am" }, { time: "10:00 am", unavailable: true }, { time: "11:30 am" }, { time: "2:00 pm" }];

/** Test-mode label for features that talk to a partner system we cannot reach (PLAN: Build (sandbox)). */
export const TestMode = ({ what }: { what: string }) => <p className="caption">Test mode: {what} uses made-up data.</p>;
