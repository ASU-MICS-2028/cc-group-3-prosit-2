import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { Icon, type IconName } from "./icons";
import { IconButton, PrimaryButton, SecondaryButton } from "./buttons";
import { Field } from "./inputs";
import { SyncBadge, type SyncStatus } from "./display";

/* ---------- 7.20 Vitals ---------- */

export type Vital = "bp" | "temp" | "weight" | "height";
export const VITAL_META: Record<Vital, { label: string; unit: string; icon: IconName }> = {
  bp: { label: "Blood pressure", unit: "mmHg", icon: "drop" },
  temp: { label: "Temperature", unit: "°C", icon: "thermometer" },
  weight: { label: "Weight", unit: "kg", icon: "scales" },
  height: { label: "Height", unit: "cm", icon: "ruler" },
};

/** Large numeric field with the unit inside on the right. Blood pressure is two fields. */
export function VitalField({ vital, error }: { vital: Vital; error?: string }) {
  const { label, unit } = VITAL_META[vital];
  if (vital === "bp") {
    return (
      <div className="vital-bp">
        <Field label={`${label}, top number`} inputMode="decimal" suffix={unit} error={error} />
        <span className="vital-slash" aria-hidden>/</span>
        <Field label="Bottom number" inputMode="decimal" suffix={unit} />
      </div>
    );
  }
  return <Field label={label} inputMode="decimal" suffix={unit} error={error} />;
}

export type Flag = "normal" | "check" | "urgent";

/** Text + icon, never colour alone. Thresholds come from the medical partner's configuration. */
export function RangeFlag({ flag }: { flag: Flag }) {
  if (flag === "normal") return null;
  return (
    <span className={`badge flag-${flag}`}>
      <Icon name="warning" size="sm" />
      {flag === "check" ? "Check" : "Urgent"}
    </span>
  );
}

export function VitalCard({ label, value, unit, taken, flag = "normal" }: { label: string; value: string; unit: string; taken: string; flag?: Flag }) {
  return (
    <div className="vital-card">
      <span className="caption">{label}</span>
      <span className="vital-value"><span className="tabular">{value}</span> <span className="caption">{unit}</span></span>
      <span className="caption tabular">{taken}</span>
      <RangeFlag flag={flag} />
    </div>
  );
}

/* ---------- 7.19 Photo capture ---------- */

export function PhotoCapture({ state, size, sync, onTake, onRetake, onDelete }: {
  state: "empty" | "captured";
  size?: string;
  sync?: SyncStatus;
  onTake?: () => void;
  onRetake?: () => void;
  onDelete?: () => void;
}) {
  if (state === "empty") {
    return (
      <button className="photo-tile" onClick={onTake}>
        <Icon name="camera" />
        Take photo
      </button>
    );
  }
  return (
    <div className="photo-done">
      <span className="photo-thumb" aria-label="Photo preview" role="img" />
      <div className="photo-meta">
        <span className="body-strong tabular">{size}</span>
        {sync && <SyncBadge status={sync} />}
      </div>
      <IconButton icon="arrow-counter-clockwise" label="Retake photo" onClick={onRetake} />
      <IconButton icon="trash" label="Delete photo" onClick={onDelete} />
    </div>
  );
}

/* ---------- 7.22 Referral priority ---------- */

export type Priority = "emergency" | "urgent" | "soon" | "routine";
const PRIORITY: Record<Priority, { copy: string; icon: IconName }> = {
  emergency: { copy: "Emergency", icon: "siren" },
  urgent: { copy: "Urgent", icon: "warning" },
  soon: { copy: "Soon", icon: "clock" },
  routine: { copy: "Routine", icon: "check" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { copy, icon } = PRIORITY[priority];
  return (
    <span className={`badge prio-${priority}`}>
      <Icon name={icon} size="sm" />
      {copy}
    </span>
  );
}

/* ---------- 7.23 Prescription ---------- */

/** QR drawn on the device, so it works offline. */
export function QrCode({ value }: { value: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [value]);
  return <span className="qr" role="img" aria-label="Verification QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export type RxStatus = "issued" | "dispensed" | "cancelled";
const RX: Record<RxStatus, { copy: string; icon: IconName }> = {
  issued: { copy: "Issued", icon: "file-text" },
  dispensed: { copy: "Dispensed", icon: "check-circle" },
  cancelled: { copy: "Cancelled", icon: "x" },
};

export function PrescriptionCard({ medicine, dose, duration, prescriber, licence, code, status }: {
  medicine: string; dose: string; duration: string; prescriber: string; licence: string; code: string; status: RxStatus;
}) {
  const { copy, icon } = RX[status];
  return (
    <article className="rx">
      <header className="rx-head">
        <h3 className="body-strong">{medicine}</h3>
        <span className={`badge rx-${status}`}><Icon name={icon} size="sm" />{copy}</span>
      </header>
      <p>{dose}</p>
      <p className="caption">{duration}</p>
      <p className="caption">{prescriber} · Licence {licence}</p>
      <footer className="rx-verify">
        <div>
          <span className="caption">Verification code</span>
          <span className="rx-code tabular">{code}</span>
        </div>
        <QrCode value={`hc-rx:${code}`} />
      </footer>
    </article>
  );
}

/* ---------- 7.24 Emergency ---------- */

/** The only filled red button. Same position on every CHV patient screen. */
export function EmergencyButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`btn btn-emergency ${props.className ?? ""}`}>
      <Icon name="siren" />
      Emergency
    </button>
  );
}

export type Step = { label: string; who?: string; time?: string; state: "done" | "waiting" | "todo" };

export function EscalationTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="timeline" aria-label="Emergency progress">
      {steps.map((s) => (
        <li key={s.label} className={`tl-${s.state}`} aria-current={s.state === "waiting" ? "step" : undefined}>
          <span className="tl-dot" aria-hidden>{s.state === "done" && <Icon name="check" size="sm" />}</span>
          <span>
            <span className="body-strong">{s.label}</span>
            <span className="caption tabular">{[s.who, s.time].filter(Boolean).join(" · ") || (s.state === "waiting" ? "Waiting for acknowledgement" : "")}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** With no data connection, offer Call and SMS straight away. */
export function OfflineEmergencyActions({ number }: { number: string }) {
  return (
    <div className="row">
      <a className="btn btn-secondary btn-link" href={`tel:${number}`}><Icon name="phone-call" />Call</a>
      <a className="btn btn-secondary btn-link" href={`sms:${number}`}><Icon name="chat-text" />SMS</a>
    </div>
  );
}

/* ---------- 7.21 Video call ---------- */

export type Quality = "good" | "weak" | "audio";
const QUALITY: Record<Quality, string> = { good: "Good", weak: "Weak", audio: "Audio only" };

export function ConnectionIndicator({ quality }: { quality: Quality }) {
  return (
    <span className={`badge conn conn-${quality}`}>
      <Icon name={quality === "audio" ? "wifi-slash" : "cell-signal-high"} size="sm" />
      {QUALITY[quality]}
    </span>
  );
}

export function RecordingIndicator() {
  return (
    <span className="badge rec-pill" role="status">
      <span className="rec-dot" aria-hidden />
      Recording
    </span>
  );
}

export function CallScreen({ quality, recording, audioOnly, muted, camOff, name }: {
  quality: Quality; recording?: boolean; audioOnly?: boolean; muted?: boolean; camOff?: boolean; name: string;
}) {
  return (
    <div className="call">
      <div className="call-top">
        <ConnectionIndicator quality={quality} />
        {recording && <RecordingIndicator />}
      </div>
      <div className="call-remote">
        <span className="call-name title-2">{name}</span>
        {audioOnly && <span className="caption">Audio only</span>}
      </div>
      {!audioOnly && <div className="call-self" aria-label="Your preview" role="img" />}
      <div className="call-controls">
        <button className={`call-btn${muted ? " is-off" : ""}`} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
          <Icon name={muted ? "microphone-slash" : "microphone"} />
        </button>
        <button className={`call-btn${camOff ? " is-off" : ""}`} aria-label={camOff ? "Turn camera on" : "Turn camera off"} aria-pressed={camOff}>
          <Icon name={camOff ? "video-camera-slash" : "video-camera"} />
        </button>
        <button className={`call-btn${audioOnly ? " is-off" : ""}`} aria-label="Switch to audio only" aria-pressed={audioOnly}>
          <Icon name="phone" />
        </button>
        <button className="call-end" aria-label="End call"><Icon name="phone-disconnect" /></button>
      </div>
    </div>
  );
}

export function PreCall({ provider, time }: { provider: string; time: string }) {
  const checks: [string, string][] = [["Camera", "Ready"], ["Microphone", "Ready"], ["Network", "Weak: audio may be better"]];
  return (
    <div className="precall">
      <h2 className="title-2">{provider}</h2>
      <p className="caption tabular">{time}</p>
      <ul className="checklist">
        {checks.map(([k, v]) => (
          <li key={k}><Icon name="check-circle" size="sm" /><span className="body-strong">{k}</span><span className="caption">{v}</span></li>
        ))}
      </ul>
      <PrimaryButton>Join call</PrimaryButton>
      <SecondaryButton>Join with audio only</SecondaryButton>
    </div>
  );
}
