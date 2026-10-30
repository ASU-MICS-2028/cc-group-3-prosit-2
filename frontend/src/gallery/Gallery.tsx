import { useState, type ReactNode } from "react";
import { Logo, Mascot, Wordmark, type Mood } from "../components/brand";
import { Chip, IconButton, ListenButton, MicButton, PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { CategoryTile, OfflineBanner, PersonRow, PromoCard, StateView, SyncBadge, Toast, type SyncStatus } from "../components/display";
import { Field, PhoneField, SearchField } from "../components/inputs";
import { BottomNav, ConfirmDialog, Header, Sheet, type Tab } from "../components/nav";
import { DateStrip, TimeSlots } from "../components/schedule";
import {
  CallScreen, EmergencyButton, EscalationTimeline, OfflineEmergencyActions, PhotoCapture, PreCall, PrescriptionCard,
  PriorityBadge, RangeFlag, VitalCard, VitalField, type Priority,
} from "../components/clinical";

const TABS: Tab[] = [
  { key: "today", label: "Today", icon: "house" },
  { key: "patients", label: "Patients", icon: "users" },
  { key: "visits", label: "Visits", icon: "calendar-blank" },
  { key: "messages", label: "Messages", icon: "chat-circle-text" },
  { key: "me", label: "Me", icon: "user" },
];
const DAYS = [
  { key: "mon", weekday: "M", date: 3 }, { key: "tue", weekday: "T", date: 4 }, { key: "wed", weekday: "W", date: 5 },
  { key: "thu", weekday: "T", date: 6 }, { key: "fri", weekday: "F", date: 7 }, { key: "sat", weekday: "S", date: 8 },
];
const SLOTS = [
  { time: "8:00 am" }, { time: "9:30 am" }, { time: "10:00 am", unavailable: true }, { time: "11:30 am" }, { time: "2:00 pm" }, { time: "3:30 pm", unavailable: true },
];
const COLOURS: [string, string][] = [
  ["--lavender", "Brand surface"], ["--ink", "Text, buttons"], ["--mist", "Dividers"], ["--cream", "Mascot"],
  ["--canvas", "Page"], ["--surface", "Cards"], ["--lavender-tint", "Tiles"], ["--violet", "Links, focus"],
  ["--text-muted", "Secondary text"], ["--tan", "Mascot smile"], ["--ok-bg", "Sent, ok"], ["--warn-bg", "Pending"], ["--danger-bg", "Error"], ["--danger", "Emergency only"],
];
const MOODS: Mood[] = ["welcoming", "thinking", "resting", "concerned", "celebrating"];
const SYNC: SyncStatus[] = ["saved", "sending", "sent", "attention"];
const PRIORITIES: Priority[] = ["emergency", "urgent", "soon", "routine"];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="gallery-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="heading" id={`${id}-h`}>{title}</h2>
      {note && <p className="caption">{note}</p>}
      {children}
    </section>
  );
}
const State = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="gallery-state"><span className="overline">{name}</span>{children}</div>
);

export function Gallery() {
  const [chips, setChips] = useState<string[]>(["Fever"]);
  const [day, setDay] = useState("tue");
  const [slot, setSlot] = useState<string | undefined>("9:30 am");
  const [tab, setTab] = useState("today");
  const [sheet, setSheet] = useState<"none" | "emergency" | "referral">("none");
  const [toast, setToast] = useState(false);
  const [playing, setPlaying] = useState(false);
  const toggle = (c: string) => setChips((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  return (
    <main className="gallery">
      <Header kind="home" greeting="Hi Ama" subtitle="Component gallery · design system v0.2" actions={<IconButton icon="bell" label="Notifications" dot />} />

      <Section id="brand" title="Brand" note="Talk-bubble mark and mascot. The mascot never appears on bad-news screens.">
        <div className="row"><Wordmark /><Logo size={32} /><Logo size={64} full /></div>
        <div className="row">{MOODS.map((m) => <State key={m} name={m}><Mascot mood={m} size={96} /></State>)}</div>
        <div className="gallery-onboard">
          <h3 className="display">Care made close to home</h3>
          <p className="caption">Onboarding gradient: the only gradient in the app.</p>
        </div>
      </Section>

      <Section id="colour" title="Colour tokens">
        <div className="swatches">
          {COLOURS.map(([v, use]) => (
            <div className="swatch" key={v} style={{ background: `var(${v})`, color: ["--ink", "--violet", "--text-muted", "--danger"].includes(v) ? "var(--on-ink)" : "var(--ink)" }}>
              <b>{v}</b>{use}
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Type scale" note="EB Garamond only at large sizes (22 and up); everything smaller is Overpass. Twi test line below.">
        <p className="display">Display</p>
        <p className="title-1">Title 1: Hi Ama</p>
        <p className="title-2">Title 2: Appointment</p>
        <p className="heading">Heading: Appointment slot</p>
        <p>Body: Book a visit. Ɛyɛ, ɔhaw, ŋ, ɖ, ƒ, ɣ, ʋ, ʒ, ɓ, ɗ, ƙ, ƴ, ₵ 25.00</p>
        <p className="body-strong">Body strong: Kwame Mensah</p>
        <p className="label">Label: chip text</p>
        <p className="caption">Caption: General practitioner</p>
        <p className="overline">Overline</p>
      </Section>

      <Section id="buttons" title="Buttons" note="Primary: one per screen. Pressed and focus are forced here so they can be seen.">
        <State name="Primary, full width"><PrimaryButton>Book now</PrimaryButton></State>
        <State name="Primary, arrow"><PrimaryButton variant="arrow">Get started</PrimaryButton></State>
        <State name="Pressed"><PrimaryButton forceState="pressed">Book now</PrimaryButton></State>
        <State name="Focused"><PrimaryButton forceState="focus">Book now</PrimaryButton></State>
        <State name="Disabled"><PrimaryButton disabled>Book now</PrimaryButton></State>
        <State name="Loading"><PrimaryButton loading>Book now</PrimaryButton></State>
        <div className="row">
          <State name="Secondary"><SecondaryButton>Cancel</SecondaryButton></State>
          <State name="Pressed"><SecondaryButton forceState="pressed">Cancel</SecondaryButton></State>
          <State name="Focused"><SecondaryButton forceState="focus">Cancel</SecondaryButton></State>
          <State name="Disabled"><SecondaryButton disabled>Cancel</SecondaryButton></State>
        </div>
        <div className="row">
          <State name="Text button"><TextButton>View all</TextButton></State>
          <State name="Pressed"><TextButton forceState="pressed">View all</TextButton></State>
          <State name="Focused"><TextButton forceState="focus">View all</TextButton></State>
          <State name="Disabled"><TextButton disabled>View all</TextButton></State>
        </div>
        <div className="row">
          <State name="Icon button"><IconButton icon="magnifying-glass" label="Search" /></State>
          <State name="With dot"><IconButton icon="bell" label="Notifications" dot /></State>
          <State name="Pressed"><IconButton icon="dots-three" label="More" forceState="pressed" /></State>
          <State name="Focused"><IconButton icon="arrow-left" label="Back" forceState="focus" /></State>
          <State name="Disabled"><IconButton icon="dots-three" label="More" disabled /></State>
        </div>
      </Section>

      <Section id="chips" title="Chips" note="Selected = lavender with ink text and a check. Multi-select for symptoms.">
        <div className="chip-row">
          {["All", "Fever", "Cough", "Headache", "Diarrhoea", "Rash"].map((c) => (
            <Chip key={c} selected={chips.includes(c)} onClick={() => toggle(c)}>{c}</Chip>
          ))}
        </div>
        <div className="row">
          <State name="Default"><Chip>GP</Chip></State>
          <State name="Selected"><Chip selected>GP</Chip></State>
          <State name="Pressed"><Chip forceState="pressed">GP</Chip></State>
          <State name="Focused"><Chip forceState="focus">GP</Chip></State>
          <State name="Disabled"><Chip disabled>GP</Chip></State>
        </div>
      </Section>

      <Section id="cards" title="Tiles, promo card, person rows">
        <div className="chip-row">
          <CategoryTile icon="baby" label="Maternal" />
          <CategoryTile icon="pill" label="Medicines" />
          <CategoryTile icon="calendar-check" label="Follow-ups" />
          <CategoryTile icon="users" label="Households" />
        </div>
        <PromoCard title="Vaccination day: Saturday at the clinic" action="Learn more" />
        <PersonRow name="Akosua Boateng" role="Follow-up: blood pressure" hours="Due 8:30 am" trailing={<SyncBadge status="saved" />} />
        <PersonRow name="Dr. Kofi Mensah" role="General practitioner" hours="8:00 am – 4:00 pm" />
      </Section>

      <Section id="schedule" title="Date strip and time slots" note="12-hour times. Stored in UTC, shown in the device's time zone.">
        <DateStrip days={DAYS} selected={day} onSelect={setDay} />
        <TimeSlots slots={SLOTS} selected={slot} onSelect={setSlot} />
      </Section>

      <Section id="sync" title="Sync status and offline banner">
        <div className="row">{SYNC.map((s) => <SyncBadge key={s} status={s} />)}</div>
        <OfflineBanner mode="offline" />
        <OfflineBanner mode="back" />
      </Section>

      <Section id="inputs" title="Inputs">
        <Field label="Full name" helper="As the patient says it" />
        <Field label="Focused" defaultValue="Ama Serwaa" forceFocus />
        <Field label="Village" defaultValue="Dodowa" error="Please add the village name" />
        <Field label="Locked" defaultValue="Read only" disabled />
        <PhoneField label="Phone number" helper="Digits only" />
        <Field label="Notes" voice helper="Type, or tap the microphone" />
        <SearchField placeholder="Search patients" />
      </Section>

      <Section id="voice" title="Voice: listen and speak">
        <div className="row">
          <ListenButton playing={playing} onClick={() => setPlaying((p) => !p)} />
          <span>Tap to hear the consent in Twi</span>
        </div>
        <div className="row">
          <State name="Mic, idle"><MicButton /></State>
          <State name="Recording"><MicButton recording seconds={14} /></State>
          <State name="Transcribing later"><SyncBadge status="sending" /></State>
        </div>
      </Section>

      <Section id="photo" title="Photo capture" note="Compressed on the phone, encrypted, sent after the text.">
        <PhotoCapture state="empty" />
        <PhotoCapture state="captured" size="84 KB" sync="saved" />
      </Section>

      <Section id="vitals" title="Vitals" note="Range flags use thresholds from the medical partner's configuration.">
        <VitalField vital="bp" />
        <div className="row"><VitalField vital="temp" /><VitalField vital="weight" /></div>
        <VitalField vital="height" error="Height should be in centimetres" />
        <div className="chip-row">
          <VitalCard label="Blood pressure" value="118/76" unit="mmHg" taken="Today, 8:12 am" />
          <VitalCard label="Temperature" value="38.4" unit="°C" taken="Today, 8:14 am" flag="check" />
          <VitalCard label="Blood pressure" value="182/118" unit="mmHg" taken="Today, 8:15 am" flag="urgent" />
        </div>
        <div className="row"><RangeFlag flag="check" /><RangeFlag flag="urgent" /></div>
      </Section>

      <Section id="referral" title="Referral priority">
        <div className="row">{PRIORITIES.map((p) => <PriorityBadge key={p} priority={p} />)}</div>
        <PersonRow name="Esi Quaye" role="Fever 3 days, rash" hours="Waiting 12 min" trailing={<PriorityBadge priority="urgent" />} />
        <PersonRow name="Yaw Owusu" role="Cough, 2 weeks" hours="Waiting 1 h 05" trailing={<PriorityBadge priority="routine" />} />
        <SecondaryButton onClick={() => setSheet("referral")}>Open referral sheet</SecondaryButton>
      </Section>

      <Section id="rx" title="Prescription card">
        <PrescriptionCard medicine="Amoxicillin 500 mg" dose="1 capsule, 3 times a day" duration="7 days" prescriber="Dr. Kofi Mensah" licence="MDC-00000" code="4829 6150" status="issued" />
        <PrescriptionCard medicine="Paracetamol 500 mg" dose="2 tablets when needed" duration="3 days" prescriber="Dr. Kofi Mensah" licence="MDC-00000" code="1177 0932" status="dispensed" />
      </Section>

      <Section id="call" title="Video call">
        <CallScreen name="Dr. Kofi Mensah" quality="good" recording />
        <CallScreen name="Dr. Kofi Mensah" quality="audio" audioOnly muted />
        <PreCall provider="Dr. Kofi Mensah" time="Tue 4 Nov, 8:00 am" />
      </Section>

      <Section id="emergency" title="Emergency" note="The only filled red button. No mascot, no celebration.">
        <EmergencyButton onClick={() => setSheet("emergency")} />
        <EscalationTimeline steps={[
          { label: "Raised", time: "8:21 am", state: "done" },
          { label: "Notified", who: "Nurse Adjei", time: "8:21 am", state: "done" },
          { label: "Acknowledged", state: "waiting" },
        ]} />
        <p className="caption">With no data connection:</p>
        <OfflineEmergencyActions number="0000000000" />
      </Section>

      <Section id="states" title="Empty, loading, error" note="Concerned mascot on errors, except on sensitive screens (plain).">
        <StateView kind="empty" text="No visits today. Add a patient to begin." action={<PrimaryButton>Add patient</PrimaryButton>} />
        <StateView kind="loading" text="Getting your visits…" />
        <StateView kind="error" text="We couldn't send this yet. It is saved on this phone." action={<SecondaryButton>Try again</SecondaryButton>} />
        <StateView kind="error" plain text="This result can't be shown right now. Please try again in a moment." />
      </Section>

      <Section id="overlays" title="Sheets, dialogs, toast">
        <div className="row">
          <SecondaryButton onClick={() => setSheet("referral")}>Bottom sheet</SecondaryButton>
          <SecondaryButton onClick={() => setToast(true)}>Show toast</SecondaryButton>
        </div>
        <ConfirmDialog title="Delete this photo?" body="It will be removed from this phone. This can't be undone." cancel={<SecondaryButton>Cancel</SecondaryButton>} confirm={<PrimaryButton>Delete</PrimaryButton>} />
        {toast && <Toast>Saved on this phone</Toast>}
      </Section>

      <Section id="nav" title="Header and bottom navigation">
        <Header kind="inner" title="Akosua Boateng" caption="Tue 4 Nov" />
        <div className="nav-demo"><BottomNav tabs={TABS} active={tab} onSelect={setTab} /></div>
      </Section>

      <Sheet open={sheet === "emergency"} onClose={() => setSheet("none")} title="Mark as emergency?">
        <div className="chip-row">{["Not breathing well", "Heavy bleeding", "Fits", "Unconscious"].map((c) => <Chip key={c}>{c}</Chip>)}</div>
        <EmergencyButton />
        <SecondaryButton onClick={() => setSheet("none")}>Not now</SecondaryButton>
      </Sheet>
      <Sheet open={sheet === "referral"} onClose={() => setSheet("none")} title="Refer Esi Quaye">
        <Field label="Reason" voice />
        <PriorityBadge priority="urgent" />
        <p className="caption">Suggested from fever and rash. You can raise it, not lower an automatic emergency.</p>
        <PrimaryButton onClick={() => setSheet("none")}>Send referral</PrimaryButton>
      </Sheet>
    </main>
  );
}
