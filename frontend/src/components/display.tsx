import type { ReactNode } from "react";
import { DuotoneIcon, Icon, type DuotoneName, type IconName } from "./icons";
import { Mascot, type Mood } from "./brand";

/** 7.6: lavender-tint tile, duotone icon top-left, label bottom-left. */
export function CategoryTile({ icon, label, onClick }: { icon: DuotoneName; label: string; onClick?: () => void }) {
  return (
    <button className="tile" onClick={onClick}>
      <DuotoneIcon name={icon} />
      <span className="tile-label">{label}</span>
    </button>
  );
}

/** 7.7: health tips and campaign messages, not upsells. */
export function PromoCard({ title, action, mood = "welcoming" }: { title: string; action: string; mood?: Mood }) {
  return (
    <section className="promo">
      <div className="promo-body">
        <h3 className="promo-title">{title}</h3>
        <button className="pill-small">{action}</button>
      </div>
      <div className="promo-art"><Mascot mood={mood} /></div>
    </section>
  );
}

/** Initials avatar: the default, to save mobile data (7.8). */
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="avatar" aria-hidden>{initials}</span>;
}

/** 7.8: person or provider row. No ratings unless the brief asks. */
export function PersonRow({ name, role, hours, trailing, onClick }: { name: string; role: string; hours?: string; trailing?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="person" onClick={onClick}>
      <Avatar name={name} />
      <span className="person-text">
        <span className="person-name">{name}</span>
        <span className="caption">{role}</span>
        {hours && <span className="caption tabular">{hours}</span>}
      </span>
      {trailing}
    </Tag>
  );
}

export type SyncStatus = "saved" | "sending" | "sent" | "attention";
const SYNC: Record<SyncStatus, { copy: string; icon?: IconName }> = {
  saved: { copy: "Saved on phone", icon: "phone" },
  sending: { copy: "Sending…" },
  sent: { copy: "Sent", icon: "check" },
  attention: { copy: "Needs attention", icon: "warning" },
};

/** 7.10: always shown wherever data is created. Text and icon, never colour alone. */
export function SyncBadge({ status }: { status: SyncStatus }) {
  const { copy, icon } = SYNC[status];
  return (
    <span className={`badge sync-${status}`}>
      {icon ? <Icon name={icon} size="sm" /> : <span className="dots dots-sm" aria-hidden><i /><i /><i /></span>}
      {copy}
    </span>
  );
}

/** 7.11: the strip under the header while offline, then "Back online" for 3 seconds. */
export function OfflineBanner({ mode }: { mode: "offline" | "back" }) {
  return (
    <div className="banner" role="status">
      <Icon name="cloud-slash" size="sm" />
      {mode === "offline" ? "You're offline. Changes are saved on this phone." : "Back online, sending…"}
    </div>
  );
}

/** 7.16: skeleton blocks, never a lone spinner. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton-line" />)}
    </div>
  );
}

/** 7.16: empty, loading, error. Sensitive screens pass `plain` to drop the mascot. */
export function StateView({ kind, text, action, plain }: { kind: "empty" | "loading" | "error"; text: string; action?: ReactNode; plain?: boolean }) {
  const mood: Mood = kind === "empty" ? "resting" : kind === "loading" ? "thinking" : "concerned";
  return (
    <div className="state-view">
      {!plain && <Mascot mood={mood} size={120} />}
      {kind === "loading" && <Skeleton lines={2} />}
      <p className="state-text">{text}</p>
      {action}
    </div>
  );
}

/** 7.17: one at a time, auto-hides after 4 seconds. */
export function Toast({ children }: { children: ReactNode }) {
  return <div className="toast" role="status">{children}</div>;
}
