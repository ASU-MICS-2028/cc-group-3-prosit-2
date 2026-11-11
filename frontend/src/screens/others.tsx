import { useState } from "react";
import { Chip, ListenButton, PrimaryButton, SecondaryButton } from "../components/buttons";
import { SyncBadge } from "../components/display";
import { DateStrip, TimeSlots } from "../components/schedule";
import { CallScreen, PreCall, PriorityBadge, VitalCard } from "../components/clinical";
import { DispensedList, ImageViewer, Medicines, Prescribe, Verify } from "./prescriptions";
import { PayFee } from "./payments";
import { Audit, FacilityHome, FacilityPeople, Revenue, Sdg3, Users } from "./admin";
import { Insurance } from "./insurance";
import { DAYS, Heading, KV, Rows, SLOTS, TestMode, Tiles, go, sync, type ScreenDef } from "./kit";

/* ---------------- Patient ---------------- */
function PatientVisits() {
  const [slot, setSlot] = useState<string>();
  return (<>
    <Rows items={[{ name: "Dr. Kofi Mensah", role: "Video visit", hours: "Tue 4 Nov, 8:00 am", to: "patient.call" }]} />
    <Heading>Book another</Heading>
    <DateStrip days={DAYS} selected="wed" />
    <TimeSlots slots={SLOTS} selected={slot} onSelect={setSlot} />
    <PrimaryButton disabled={!slot}>Book visit</PrimaryButton>
  </>);
}
export const patient: Record<string, ScreenDef> = {
  "patient.home": { title: "Hi Akosua", caption: "Your next visit", render: () => (<>
    <Rows items={[{ name: "Dr. Kofi Mensah", role: "Video visit", hours: "Tue 4 Nov, 8:00 am", to: "patient.visits" }]} />
    <Heading>Reminders</Heading>
    <Rows items={[{ name: "Take your tablets", role: "Every morning" }]} />
    <Tiles items={[{ icon: "calendar-check", label: "Visits", to: "patient.visits" }, { icon: "pill", label: "Medicines", to: "patient.medicines" }, { icon: "pill", label: "Insurance", to: "patient.insurance" }, { icon: "users", label: "Permission", to: "patient.consent" }, { icon: "baby", label: "My pregnancy & children", to: "patient.maternal" }]} />
  </>) },
  "patient.visits": { title: "Visits", render: () => <PatientVisits /> },
  "patient.medicines": { title: "Your medicines", caption: "Show the code at the pharmacy", render: () => <Medicines /> },
  "patient.call": { title: "Video visit", render: () => <PreCall provider="Dr. Kofi Mensah" time="Tue 4 Nov, 8:00 am" /> },
  "patient.consent": { title: "Your permissions", render: () => (<>
    <div className="row"><ListenButton /><span className="body-strong">What we may do</span></div>
    <KV k="Care records" v="Yes" /><KV k="Reminders by SMS" v="Yes" /><KV k="Health advice" v="No" />
    <SecondaryButton>Change my choices</SecondaryButton>
  </>) },
  "patient.pay": { title: "Pay", render: () => <PayFee /> },
  "patient.insurance": { title: "Health insurance", render: () => <Insurance /> },
  "patient.learn": { title: "Learn", render: () => (<Rows items={[{ name: "Eating well in pregnancy", role: "Audio · 3 min", trailing: <ListenButton /> }, { name: "Safe water", role: "Video · 2 min", trailing: sync("sent") }]} />) },
};

/* ---------------- Doctor, nurse, specialist ---------------- */
export const clinician: Record<string, ScreenDef> = {
  "clinician.today": { title: "Hi Dr. Mensah", caption: "Today's visits", render: () => (<>
    <Rows items={[{ name: "Akosua Boateng", role: "Video visit · Dodowa", hours: "8:00 am", to: "clinician.call" }, { name: "Esi Quaye", role: "Referral · fever, rash", hours: "10:30 am", trailing: <PriorityBadge priority="urgent" />, to: "clinician.patient" }]} />
    <Heading>Emergencies</Heading>
    <Rows items={[{ name: "Kofi Danso", role: "Not breathing well", trailing: <PriorityBadge priority="emergency" />, to: "clinician.inbox" }]} />
  </>) },
  "clinician.patients": { title: "Patients", render: () => <Rows items={[{ name: "Akosua Boateng", role: "Hypertension", to: "clinician.patient" }, { name: "Esi Quaye", role: "Fever, rash", to: "clinician.patient" }]} /> },
  "clinician.patient": { title: "Esi Quaye", caption: "Fever, rash", render: () => (<>
    <div className="row"><VitalCard label="Temperature" value="38.9" unit="°C" taken="Today, 8:14 am" flag="urgent" /><VitalCard label="Weight" value="61" unit="kg" taken="Today, 8:14 am" /></div>
    <KV k="Allergies" v="None recorded" /><KV k="Consent" v="Care records" />
    <Heading>Shared images</Heading>
    <Rows items={[{ name: "Shared images", role: "From health workers", to: "clinician.images" }]} />
    <div className="row"><SecondaryButton onClick={() => go("clinician.prescribe")}>Prescribe</SecondaryButton><SecondaryButton onClick={() => go("clinician.call")}>Call</SecondaryButton></div>
  </>) },
  "clinician.images": { title: "Shared images", caption: "Compressed on the phone before sending", render: (param) => <ImageViewer patientId={param} /> },
  "clinician.call": { title: "Video visit", render: () => <CallScreen name="Akosua Boateng" quality="good" recording /> },
  "clinician.prescribe": { title: "Prescribe", render: () => <Prescribe /> },
};

/* ---------------- Pharmacist ---------------- */
export const pharmacist: Record<string, ScreenDef> = {
  "pharmacist.verify": { title: "Verify a prescription", render: () => <Verify /> },
  "pharmacist.queue": { title: "Dispensed", render: () => <DispensedList /> },
};

/* ---------------- GHS official ----------------
   Dashboard, map and alerts are real now: screens/surveillance.tsx (FB-7a). */
export const ghs: Record<string, ScreenDef> = {
  "ghs.policy": { title: "Policy dashboard", render: () => (<><KV k="Rural specialist visits" v="+120%" /><KV k="Maternal visits kept" v="82%" /><KV k="Emergency response" v="31 min" /><Tiles items={[{ icon: "calendar-check", label: "SDG 3 and exports", to: "ghs.sdg" }]} /><TestMode what="This dashboard" /></>) },
  "ghs.sdg": { title: "SDG 3 impact", caption: "What the records can support", render: () => <Sdg3 /> },
};

/* ---------------- Health centre admin ---------------- */
export const facility: Record<string, ScreenDef> = {
  "facility.home": { title: "Your facility", render: () => <FacilityHome /> },
  "facility.users": { title: "People", render: () => <FacilityPeople /> },
  "facility.training": { title: "Training", render: () => <><Rows items={[{ name: "Safe home visits", role: "9 of 14 finished" }, { name: "Recording vitals", role: "14 of 14 finished" }]} /><TestMode what="This list" /></> },
  "facility.reports": { title: "Reports", caption: "Your facility only", render: () => <Sdg3 /> },
};

/* ---------------- Platform admin ---------------- */
export const platform: Record<string, ScreenDef> = {
  "platform.users": { title: "Users", render: () => <Users /> },
  "platform.roles": { title: "Roles", caption: "What each role should reach", render: () => (<><KV k="CHV" v="Their patients, vitals, referrals" /><KV k="Patient" v="Their own record and bookings" /><KV k="Doctor, nurse, specialist" v="Patients with a visit with them" /><KV k="Pharmacist" v="Prescriptions only" /><KV k="Traditional healer" v="Patients referred with consent" /><KV k="GHS official" v="Anonymised totals only" /><KV k="Health centre admin" v="Their own facility" /><KV k="Platform admin" v="Users, audit, revenue; no health records" /><p className="caption">This is the design. The server checks each person's role on every request. Some per-patient limits are still being built.</p></>) },
  "platform.audit": { title: "Audit log", caption: "Who did what. No health data", render: () => <Audit /> },
  "platform.settings": { title: "Settings", render: () => (<><KV k="Emergency escalation after" v="5 minutes" /><KV k="Reminder language" v="Patient's own" /><Chip selected>Test mode on</Chip><SecondaryButton onClick={() => go("platform.revenue")}>Revenue</SecondaryButton><SecondaryButton onClick={() => go("platform.sdg3")}>SDG 3 and exports</SecondaryButton></>) },
  "platform.sdg3": { title: "SDG 3 impact", caption: "What the records can support", render: () => <Sdg3 /> },
  "platform.revenue": { title: "Revenue", caption: "Successful payments only", render: () => <Revenue /> },
};


