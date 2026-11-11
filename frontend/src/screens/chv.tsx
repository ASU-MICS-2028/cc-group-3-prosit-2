import { useState } from "react";
import { Chip, ListenButton, PrimaryButton, SecondaryButton } from "../components/buttons";
import { PromoCard, StateView } from "../components/display";
import { Field, PhoneField, SearchField } from "../components/inputs";
import { DateStrip, TimeSlots } from "../components/schedule";
import { CallScreen, EmergencyButton, PhotoCapture, PreCall, PriorityBadge, VitalCard, VitalField } from "../components/clinical";
import { DAYS, Heading, KV, Rows, SLOTS, Tiles, go, sync, type ScreenDef } from "./kit";
import { t } from "../i18n";

/** On every CHV patient screen the emergency button sits in the same place: the bottom of the page. */
const Emergency = () => <div className="stack"><EmergencyButton onClick={() => go("chv.emergency")} /></div>;

function Book() {
  const [day, setDay] = useState("tue");
  const [slot, setSlot] = useState<string>();
  return (<>
    <DateStrip days={DAYS} selected={day} onSelect={setDay} />
    <TimeSlots slots={SLOTS} selected={slot} onSelect={setSlot} />
    <p className="caption">{t("Times show in this phone's time zone. Consultation fee: ₵ 25.00 (test mode).")}</p>
    <PrimaryButton disabled={!slot} onClick={() => go("chv.visits")}>{t("Book visit")}</PrimaryButton>
  </>);
}

export const chv: Record<string, ScreenDef> = {
  "chv.today": { title: "Hi Ama", caption: "Here is your day", render: () => (<>
    <div className="row">{sync("saved")}<span className="caption">{t("3 changes waiting to send")}</span></div>
    <Heading>{t("Visits today")}</Heading>
    <Rows items={[
      { name: "Akosua Boateng", role: "Blood pressure follow-up", hours: "8:30 am", to: "chv.patient" },
      { name: "Esi Quaye", role: "Fever 3 days", hours: "10:00 am", trailing: <PriorityBadge priority="urgent" />, to: "chv.patient" },
    ]} />
    <Heading>{t("Needs a follow-up")}</Heading>
    <Rows items={[{ name: "Yaw Owusu", role: "Cough, 2 weeks", hours: "Last seen 9 days ago", to: "chv.patient" }]} />
    <Heading>{t("Quick actions")}</Heading>
    <Tiles items={[
      { icon: "users", label: "Add patient", to: "chv.register" },
      { icon: "baby", label: "Mothers & babies", to: "chv.maternal" },
      { icon: "calendar-check", label: "Survey", to: "chv.survey" },
    ]} />
    <PromoCard title={t("Vaccination day: Saturday at the clinic")} action={t("Learn more")} />
  </>) },
  "chv.patients": { title: "Patients", render: () => (<>
    <SearchField placeholder={t("Search patients")} />
    <div className="chip-row"><Chip selected>{t("All")}</Chip><Chip>{t("Follow-up")}</Chip><Chip>{t("Pregnant")}</Chip><Chip>{t("Children")}</Chip></div>
    <Rows items={[
      { name: "Akosua Boateng", role: "Hypertension", trailing: sync("sent"), to: "chv.patient" },
      { name: "Esi Quaye", role: "Fever, rash", trailing: sync("saved"), to: "chv.patient" },
      { name: "Yaw Owusu", role: "Cough", trailing: sync("sent"), to: "chv.patient" },
    ]} />
    <PrimaryButton onClick={() => go("chv.register")}>{t("Add patient")}</PrimaryButton>
  </>) },
  "chv.patient": { title: "Akosua Boateng", caption: "Hypertension", render: () => (<>
    <div className="row">{sync("sent")}</div>
    <div className="row">
      <VitalCard label={t("Blood pressure")} value="148/94" unit="mmHg" taken="Today, 8:12 am" flag="check" />
      <VitalCard label={t("Weight")} value="71" unit="kg" taken="Today, 8:14 am" />
    </div>
    <Heading>{t("Photos")}</Heading>
    <PhotoCapture state="empty" />
    <Heading>{t("History")}</Heading>
    <KV k={t("Last visit")} v="21 Oct" /><KV k={t("Consent")} v={t("Care, reminders")} />
    <div className="row"><SecondaryButton onClick={() => go("chv.vitals")}>{t("Record vitals")}</SecondaryButton><SecondaryButton onClick={() => go("chv.referral")}>{t("Refer")}</SecondaryButton><SecondaryButton onClick={() => go("chv.book")}>{t("Book visit")}</SecondaryButton></div>
    <Emergency />
  </>) },
  "chv.register": { title: "Add patient", render: () => (<>
    <Field label={t("Full name")} voice />
    <Field label={t("Village or town")} />
    <Field label={t("Year of birth")} inputMode="numeric" />
    <div className="row">{["Female", "Male"].map((s) => <Chip key={s}>{s}</Chip>)}</div>
    <PhoneField label={t("Phone number (optional)")} helper={t("Only if they agree to reminders")} />
    <PrimaryButton onClick={() => go("chv.consent")}>{t("Continue")}</PrimaryButton>
    <Emergency />
  </>) },
  "chv.consent": { title: "Permission", render: () => (<>
    <div className="row"><ListenButton /><span className="body-strong">{t("Care records")}</span></div>
    <p>{t("May we write down your health readings so your nurse and doctor can look after you?")}</p>
    <p className="caption">{t("You can say no. You can change your mind at any time.")}</p>
    <PrimaryButton onClick={() => go("chv.patients")}>{t("I agree")}</PrimaryButton>
    <SecondaryButton onClick={() => go("chv.patients")}>{t("Not now")}</SecondaryButton>
  </>) },
  "chv.vitals": { title: "Record vitals", render: () => (<>
    <VitalField vital="bp" /><VitalField vital="temp" /><VitalField vital="weight" /><VitalField vital="height" />
    <PrimaryButton onClick={() => go("chv.patient")}>{t("Save")}</PrimaryButton>
    {sync("saved")}
    <Emergency />
  </>) },
  "chv.care": { title: "Care", render: () => (<>
    <Tiles items={[
      { icon: "calendar-check", label: "Visits", to: "chv.visits" },
      { icon: "users", label: "Referrals", to: "chv.referral" },
      { icon: "users", label: "Emergencies", to: "chv.emergency" },
    ]} />
    <Heading>{t("Upcoming")}</Heading>
    <Rows items={[{ name: "Akosua Boateng", role: "Video visit with Dr. Mensah", hours: "Tue 4 Nov, 8:00 am", to: "chv.call" }]} />
  </>) },
  "chv.visits": { title: "Visits", render: () => (<>
    <DateStrip days={DAYS} selected="tue" />
    <Rows items={[{ name: "Akosua Boateng", role: "Video visit", hours: "8:00 am", to: "chv.call" }]} />
    <PrimaryButton onClick={() => go("chv.book")}>{t("Book a visit")}</PrimaryButton>
  </>) },
  "chv.book": { title: "Book a visit", render: () => <Book /> },
  "chv.call": { title: "Video visit", render: () => (<><PreCall provider="Dr. Kofi Mensah" time="Tue 4 Nov, 8:00 am" /><CallScreen name="Dr. Kofi Mensah" quality="weak" /></>) },
  "chv.learn": { title: "Learn", render: () => (<>
    <Rows items={[
      { name: "Washing hands", role: "Audio · 2 min", trailing: <ListenButton /> },
      { name: "Signs of malaria", role: "Video · 3 min", trailing: sync("sent") },
    ]} />
    <PrimaryButton onClick={() => go("chv.training")}>{t("My training")}</PrimaryButton>
  </>) },
  "chv.training": { title: "Training", render: () => (<>
    <Rows items={[{ name: "Safe home visits", role: "3 of 5 lessons", trailing: sync("sending") }, { name: "Recording vitals", role: "Certificate earned", trailing: sync("sent") }]} />
    <StateView kind="empty" plain text={t("Finish a course to get a certificate.")} />
  </>) },
};
