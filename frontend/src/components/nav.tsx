import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { IconButton } from "./buttons";

export type Tab = { key: string; label: string; icon: IconName };

/** 7.13: floating ink pill, labels under icons by default (mixed literacy), max 5 tabs. */
export function BottomNav({ tabs, active, onSelect }: { tabs: Tab[]; active: string; onSelect?: (key: string) => void }) {
  if (tabs.length > 5) throw new Error("BottomNav allows at most 5 tabs");
  return (
    <nav className="bottomnav" aria-label="Main">
      {tabs.map((t) => (
        <button key={t.key} aria-label={t.label} aria-current={t.key === active ? "page" : undefined} className={`navtab${t.key === active ? " is-active" : ""}`} onClick={() => onSelect?.(t.key)}>
          <span className="navtab-icon"><Icon name={t.icon} /></span>
          <span className="navtab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** 7.14: "home" greeting header, or "inner" back + centred title. */
export function Header(props:
  | { kind: "home"; greeting: string; subtitle?: string; actions?: ReactNode }
  | { kind: "inner"; title: string; caption?: string; onBack?: () => void; onMore?: () => void }) {
  if (props.kind === "home") {
    return (
      <header className="header header-home">
        <div>
          <h1 className="title-1">{props.greeting}</h1>
          {props.subtitle && <p className="caption">{props.subtitle}</p>}
        </div>
        <div className="header-actions">{props.actions}</div>
      </header>
    );
  }
  return (
    <header className="header header-inner">
      <IconButton icon="arrow-left" label="Back" onClick={props.onBack} />
      <div className="header-title">
        <h1 className="title-2">{props.title}</h1>
        {props.caption && <p className="caption">{props.caption}</p>}
      </div>
      <IconButton icon="dots-three" label="More" onClick={props.onMore} />
    </header>
  );
}

/** 7.15: bottom sheet, preferred over centred dialogs. Escape closes it. */
export function Sheet({ open = true, onClose, title, children, inline }: { open?: boolean; onClose?: () => void; title: string; children: ReactNode; inline?: boolean }) {
  useEffect(() => {
    if (!open || inline || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, inline, onClose]);
  if (!open) return null;
  const sheet = (
    <div className="sheet" role="dialog" aria-modal={!inline} aria-label={title}>
      <span className="sheet-handle" aria-hidden />
      <h2 className="heading">{title}</h2>
      {children}
    </div>
  );
  return inline ? sheet : <div className="scrim" onClick={onClose}><div onClick={(e) => e.stopPropagation()}>{sheet}</div></div>;
}

/** 7.15: only for destructive or irreversible actions. Secondary left, primary right. */
export function ConfirmDialog({ title, body, cancel, confirm }: { title: string; body: string; cancel: ReactNode; confirm: ReactNode }) {
  return (
    <div className="dialog" role="alertdialog" aria-label={title}>
      <h2 className="heading">{title}</h2>
      <p>{body}</p>
      <div className="dialog-actions">{cancel}{confirm}</div>
    </div>
  );
}
