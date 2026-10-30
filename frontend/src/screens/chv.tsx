import { useState } from "react";
import { Chip, ListenButton, PrimaryButton, SecondaryButton } from "../components/buttons";
import { PromoCard, StateView } from "../components/display";
import { Field, PhoneField, SearchField } from "../components/inputs";
import { DateStrip, TimeSlots } from "../components/schedule";
import { CallScreen, EmergencyButton, EscalationTimeline, OfflineEmergencyActions, PhotoCapture, PreCall, PriorityBadge, VitalCard, VitalField } from "../components/clinical";
import { DAYS, Heading, KV, Rows, SLOTS, Tiles, go, sync, type ScreenDef } from "./kit";

/** On every CHV patient screen the emergency button sits in the same place: the bottom of the page. */
const Emergency = () => <div className="stack"><EmergencyButton onClick={() => go("chv.emergency")} /></div>;

function Book() {
  const [day, setDay] = useState("tue");
  const [slot, setSlot] = useState<string>();
  return (<>
    <DateStrip days={DAYS} selected={day} onSelect={setDay} />
    <TimeSlots slots={SLOTS} selected={slot} onSelect={setSlot} />
    <p className="caption">Times show in this phone's time zone. Consultation fee: ₵ 25.00 (test mode).</p>
    <PrimaryButton disabled={!slot} onClick={() => go("chv.visits")}>Book visit</PrimaryButton>
  </>);
}

function Survey() {
  const [a, setA] = useState<string>();
  return (<>
    <p className="body-strong">In the last 2 weeks, did anyone in the household have a fever?</p>
    <div className="row">{["Yes", "No", "Not sure"].map((c) => <Chip key={c} selected={a === c} onClick={() => setA(c)}>{c}</Chip>)}</div>
    <Field label="Notes" voice />
    <PrimaryButton disabled={!a}>Save answer</PrimaryButton>
    {sync("saved")}
  </>);
}

export const chv: Record<string, ScreenDef> = {
  "chv.today": { title: "Hi Ama", caption: "Here is your day", render: () => (<>
    <div className="row">{sync("saved")}<span className="caption">3 changes waiting to send</span></div>
    <Heading>Visits today</Heading>
    <Rows items={[
      { name: "Akosua Boateng", role: "Blood pressure follow-up", hours: "8:30 am", to: "chv.patient" },
      { name: "Esi Quaye", role: "Fever 3 days", hours: "10:00 am", trailing: <PriorityBadge priority="urgent" />, to: "chv.patient" },
    ]} />
    <Heading>Needs a follow-up</Heading>
    <Rows items={[{ name: "Yaw Owusu", role: "Cough, 2 weeks", hours: "Last seen 9 days ago", to: "chv.patient" }]} />
    <Heading>Quick actions</Heading>
    <Tiles items={[
      { icon: "users", label: "Add patient", to: "chv.register" },
      { icon: "baby", label: "Mothers & babies", to: "chv.maternal" },
      { icon: "calendar-check", label: "Survey", to: "chv.survey" },
    ]} />
    <PromoCard title="Vaccination day: Saturday at the clinic" action="Learn more" />
  </>) },
  "chv.patients": { title: "Patients", render: () => (<>
    <SearchField placeholder="Search patients" />
    <div className="chip-row"><Chip selected>All</Chip><Chip>Follow-up</Chip><Chip>Pregnant</Chip><Chip>Children</Chip></div>
    <Rows items={[
      { name: "Akosua Boateng", role: "Hypertension", trailing: sync("sent"), to: "chv.patient" },
      { name: "Esi Quaye", role: "Fever, rash", trailing: sync("saved"), to: "chv.patient" },
      { name: "Yaw Owusu", role: "Cough", trailing: sync("sent"), to: "chv.patient" },
    ]} />
    <PrimaryButton onClick={() => go("chv.register")}>Add patient</PrimaryButton>
  </>) },
  "chv.patient": { title: "Akosua Boateng", caption: "Hypertension", render: () => (<>
    <div className="row">{sync("sent")}</div>
    <div className="row">
      <VitalCard label="Blood pressure" value="148/94" unit="mmHg" taken="Today, 8:12 am" flag="check" />
      <VitalCard label="Weight" value="71" unit="kg" taken="Today, 8:14 am" />
    </div>
    <Heading>Photos</Heading>
    <PhotoCapture state="empty" />
    <Heading>History</Heading>
    <KV k="Last visit" v="21 Oct" /><KV k="Consent" v="Care, reminders" />
    <div className="row"><SecondaryButton onClick={() => go("chv.vitals")}>Record vitals</SecondaryButton><SecondaryButton onClick={() => go("chv.referral")}>Refer</SecondaryButton><SecondaryButton onClick={() => go("chv.book")}>Book visit</SecondaryButton></div>
    <Emergency />
  </>) },
  "chv.register": { title: "Add patient", render: () => (<>
    <Field label="Full name" voice />
    <Field label="Village or town" />
    <Field label="Year of birth" inputMode="numeric" />
    <div className="row">{["Female", "Male"].map((s) => <Chip key={s}>{s}</Chip>)}</div>
    <PhoneField label="Phone number (optional)" helper="Only if they agree to reminders" />
    <PrimaryButton onClick={() => go("chv.consent")}>Continue</PrimaryButton>
    <Emergency />
  </>) },
  "chv.consent": { title: "Permission", render: () => (<>
    <div className="row"><ListenButton /><span className="body-strong">Care records</span></div>
    <p>May we write down your health readings so your nurse and doctor can look after you?</p>
    <p className="caption">You can say no. You can change your mind at any time.</p>
    <PrimaryButton onClick={() => go("chv.patients")}>I agree</PrimaryButton>
    <SecondaryButton onClick={() => go("chv.patients")}>Not now</SecondaryButton>
  </>) },
  "chv.vitals": { title: "Record vitals", render: () => (<>
    <VitalField vital="bp" /><VitalField vital="temp" /><VitalField vital="weight" /><VitalField vital="height" />
    <PrimaryButton onClick={() => go("chv.patient")}>Save</PrimaryButton>
    {sync("saved")}
    <Emergency />
  </>) },
  "chv.care": { title: "Care", render: () => (<>
    <Tiles items={[
      { icon: "calendar-check", label: "Visits", to: "chv.visits" },
      { icon: "users", label: "Referrals", to: "chv.referral" },
      { icon: "users", label: "Emergencies", to: "chv.emergency" },
    ]} />
    <Heading>Upcoming</Heading>
    <Rows items={[{ name: "Akosua Boateng", role: "Video visit with Dr. Mensah", hours: "Tue 4 Nov, 8:00 am", to: "chv.call" }]} />
  </>) },
  "chv.visits": { title: "Visits", render: () => (<>
    <DateStrip days={DAYS} selected="tue" />
    <Rows items={[{ name: "Akosua Boateng", role: "Video visit", hours: "8:00 am", to: "chv.call" }]} />
    <PrimaryButton onClick={() => go("chv.book")}>Book a visit</PrimaryButton>
  </>) },
  "chv.book": { title: "Book a visit", render: () => <Book /> },
  "chv.call": { title: "Video visit", render: () => (<><PreCall provider="Dr. Kofi Mensah" time="Tue 4 Nov, 8:00 am" /><CallScreen name="Dr. Kofi Mensah" quality="weak" /></>) },
  "chv.referral": { title: "Refer a patient", render: () => (<>
    <Field label="Reason" voice />
    <div className="row"><PriorityBadge priority="urgent" /><span className="caption">Suggested from fever and rash</span></div>
    <Field label="Send to" defaultValue="Korle Bu (test)" />
    <PrimaryButton onClick={() => go("chv.care")}>Send referral</PrimaryButton>
    <Emergency />
  </>) },
  "chv.emergency": { title: "Emergency", render: () => (<>
    <EscalationTimeline steps={[{ label: "Raised", time: "8:21 am", state: "done" }, { label: "Notified", who: "Nurse Adjei", time: "8:21 am", state: "done" }, { label: "Acknowledged", state: "waiting" }]} />
    <p className="caption">If there is no signal:</p>
    <OfflineEmergencyActions number="0000000000" />
  </>) },
  "chv.survey": { title: "Health survey", caption: "Fever in the household", render: () => <Survey /> },
  "chv.maternal": { title: "Mothers & babies", render: () => (<>
    <Rows items={[
      { name: "Abena Tetteh", role: "Pregnant, 28 weeks", hours: "Next visit Thu 6 Nov", trailing: sync("sent") },
      { name: "Baby Kwesi", role: "9 months", hours: "Vaccine due Mon 10 Nov" },
    ]} />
    <p className="caption">Reminders go out by SMS in the mother's language (test mode).</p>
  </>) },
  "chv.learn": { title: "Learn", render: () => (<>
    <Rows items={[
      { name: "Washing hands", role: "Audio · 2 min", trailing: <ListenButton /> },
      { name: "Signs of malaria", role: "Video · 3 min", trailing: sync("sent") },
    ]} />
    <PrimaryButton onClick={() => go("chv.training")}>My training</PrimaryButton>
  </>) },
  "chv.training": { title: "Training", render: () => (<>
    <Rows items={[{ name: "Safe home visits", role: "3 of 5 lessons", trailing: sync("sending") }, { name: "Recording vitals", role: "Certificate earned", trailing: sync("sent") }]} />
    <StateView kind="empty" plain text="Finish a course to get a certificate." />
  </>) },
};
