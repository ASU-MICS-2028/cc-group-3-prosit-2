import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** Gallery-only: forces a visual state so pressed/focus can be shown without a finger. */
export type ForcedState = "pressed" | "focus";
const forced = (s?: ForcedState) => (s ? ` is-${s}` : "");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { forceState?: ForcedState };

type PrimaryProps = BtnProps & { variant?: "full" | "arrow"; loading?: boolean };

/** 7.1: the black pill. Only one per screen. */
export function PrimaryButton({ variant = "full", loading, forceState, children, className = "", disabled, ...rest }: PrimaryProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn btn-primary btn-${variant}${loading ? " is-loading" : ""}${forced(forceState)} ${className}`}
    >
      {loading ? (
        <>
          <span className="dots" aria-hidden><i /><i /><i /></span>
          <span className="sr-only">{children}, loading</span>
        </>
      ) : (
        <>
          <span className="btn-label">{children}</span>
          {variant === "arrow" && (
            <span className="btn-arrow"><Icon name="arrow-right" /></span>
          )}
        </>
      )}
    </button>
  );
}

/** 7.2: for Cancel, Skip, Not now. */
export function SecondaryButton({ forceState, className = "", ...rest }: BtnProps) {
  return <button {...rest} className={`btn btn-secondary${forced(forceState)} ${className}`} />;
}

/** 7.3: link-style action, e.g. "View all". */
export function TextButton({ forceState, className = "", ...rest }: BtnProps) {
  return <button {...rest} className={`btn-text${forced(forceState)} ${className}`} />;
}

/** 7.4: round icon button. `dot` is only for unread items that need action. */
export function IconButton({ icon, label, dot, forceState, className = "", ...rest }: BtnProps & { icon: IconName; label: string; dot?: boolean }) {
  return (
    <button {...rest} aria-label={label} className={`icon-btn${forced(forceState)} ${className}`}>
      <Icon name={icon} size="sm" />
      {dot && <span className="notif-dot" aria-hidden />}
    </button>
  );
}

/** 7.5: filter, symptom or language chip. Selected shows a check, never colour alone. */
export function Chip({ selected, forceState, children, className = "", ...rest }: BtnProps & { selected?: boolean }) {
  return (
    <button {...rest} aria-pressed={selected} className={`chip${selected ? " is-selected" : ""}${forced(forceState)} ${className}`}>
      {selected && <Icon name="check" size="sm" />}
      {children}
    </button>
  );
}

/** 7.18: plays recorded audio of the text next to it, in the chosen language. */
export function ListenButton({ playing, label = "Listen", forceState, ...rest }: BtnProps & { playing?: boolean; label?: string }) {
  return (
    <button {...rest} aria-label={label} aria-pressed={playing} className={`listen-btn${playing ? " is-playing" : ""}${forced(forceState)}`}>
      {playing ? <span className="bars" aria-hidden><i /><i /><i /><i /></span> : <Icon name="speaker-high" size="sm" />}
    </button>
  );
}

/** 7.18: voice note. Recording shows a dot, a timer and a waveform; works offline. */
export function MicButton({ recording, seconds = 0, forceState, ...rest }: BtnProps & { recording?: boolean; seconds?: number }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  if (recording) {
    return (
      <button {...rest} aria-label="Stop recording" className={`mic-recording${forced(forceState)}`}>
        <span className="rec-dot" aria-hidden />
        <span className="tabular">{mm}:{ss}</span>
        <span className="bars" aria-hidden><i /><i /><i /><i /><i /></span>
        <Icon name="stop" size="sm" />
      </button>
    );
  }
  return (
    <button {...rest} aria-label="Record a voice note" className={`listen-btn mic-btn${forced(forceState)}`}>
      <Icon name="microphone" size="sm" />
    </button>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}
