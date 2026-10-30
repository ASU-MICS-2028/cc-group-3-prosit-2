import { useState } from "react";
import { Chip, ListenButton, PrimaryButton, SecondaryButton } from "../components/buttons";
import { SyncBadge } from "../components/display";
import { Field } from "../components/inputs";
import { DateStrip, TimeSlots } from "../components/schedule";
import { CallScreen, EscalationTimeline, PreCall, PrescriptionCard, PriorityBadge, RangeFlag, VitalCard } from "../components/clinical";
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
    <Tiles items={[{ icon: "calendar-check", label: "Visits", to: "patient.visits" }, { icon: "pill", label: "Insurance", to: "patient.insurance" }, { icon: "users", label: "Permission", to: "patient.consent" }]} />
  </>) },
  "patient.visits": { title: "Visits", render: () => <PatientVisits /> },
  "patient.call": { title: "Video visit", render: () => <PreCall provider="Dr. Kofi Mensah" time="Tue 4 Nov, 8:00 am" /> },
  "patient.consent": { title: "Your permissions", render: () => (<>
    <div className="row"><ListenButton /><span className="body-strong">What we may do</span></div>
    <KV k="Care records" v="Yes" /><KV k="Reminders by SMS" v="Yes" /><KV k="Health advice" v="No" />
    <SecondaryButton>Change my choices</SecondaryButton>
  </>) },
  "patient.pay": { title: "Pay", render: () => (<>
    <KV k="Consultation fee" v="₵ 25.00" />
    <PrimaryButton>Pay with mobile money</PrimaryButton>
    <TestMode what="Payment (votex365 test mode)" />
    <Heading>Receipts</Heading>
    <Rows items={[{ name: "Visit 21 Oct", role: "₵ 25.00", trailing: sync("sent") }]} />
  </>) },
  "patient.insurance": { title: "Health insurance", render: () => (<>
    <KV k="Plan" v="Community plan" /><KV k="Premium" v="₵ 10.00 a month" /><KV k="NHIS check" v="Active (test)" />
    <PrimaryButton>Pay this month's premium</PrimaryButton>
    <TestMode what="NHIS and payment" />
  </>) },
  "patient.learn": { title: "Learn", render: () => (<Rows items={[{ name: "Eating well in pregnancy", role: "Audio · 3 min", trailing: <ListenButton /> }, { name: "Safe water", role: "Video · 2 min", trailing: sync("sent") }]} />) },
};

/* ---------------- Doctor, nurse, specialist ---------------- */
function Prescribe() {
  const [shown, setShown] = useState(false);
  return (<>
    <Field label="Patient" defaultValue="Akosua Boateng" />
    <Field label="Medicine" defaultValue="Amlodipine 5 mg" />
    <Field label="How to take it" defaultValue="1 tablet each morning" voice />
    <PrimaryButton onClick={() => setShown(true)}>Issue prescription</PrimaryButton>
    {shown && <PrescriptionCard medicine="Amlodipine 5 mg" dose="1 tablet each morning" duration="30 days" prescriber="Dr. Kofi Mensah" licence="MDC-00000" code="5503 1187" status="issued" />}
  </>);
}
export const clinician: Record<string, ScreenDef> = {
  "clinician.today": { title: "Hi Dr. Mensah", caption: "Today's visits", render: () => (<>
    <Rows items={[{ name: "Akosua Boateng", role: "Video visit · Dodowa", hours: "8:00 am", to: "clinician.call" }, { name: "Esi Quaye", role: "Referral · fever, rash", hours: "10:30 am", trailing: <PriorityBadge priority="urgent" />, to: "clinician.patient" }]} />
    <Heading>Emergencies</Heading>
    <Rows items={[{ name: "Kofi Danso", role: "Not breathing well", trailing: <PriorityBadge priority="emergency" />, to: "clinician.emergency" }]} />
  </>) },
  "clinician.patients": { title: "Patients", render: () => <Rows items={[{ name: "Akosua Boateng", role: "Hypertension", to: "clinician.patient" }, { name: "Esi Quaye", role: "Fever, rash", to: "clinician.patient" }]} /> },
  "clinician.patient": { title: "Esi Quaye", caption: "Fever, rash", render: () => (<>
    <div className="row"><VitalCard label="Temperature" value="38.9" unit="°C" taken="Today, 8:14 am" flag="urgent" /><VitalCard label="Weight" value="61" unit="kg" taken="Today, 8:14 am" /></div>
    <KV k="Allergies" v="None recorded" /><KV k="Consent" v="Care records" />
    <Heading>Shared images</Heading>
    <Rows items={[{ name: "Rash photo", role: "84 KB · from Ama S.", to: "clinician.images" }]} />
    <div className="row"><SecondaryButton onClick={() => go("clinician.prescribe")}>Prescribe</SecondaryButton><SecondaryButton onClick={() => go("clinician.call")}>Call</SecondaryButton></div>
  </>) },
  "clinician.images": { title: "Shared image", render: () => (<><div className="photo-thumb" role="img" aria-label="Image preview" /><p className="caption">Compressed to 84 KB on the phone. Zoom and compare arrive with the image-sharing step.</p></>) },
  "clinician.call": { title: "Video visit", render: () => <CallScreen name="Akosua Boateng" quality="good" recording /> },
  "clinician.inbox": { title: "Referrals & emergencies", caption: "Most urgent first", render: () => (<>
    <Rows items={[
      { name: "Kofi Danso", role: "Emergency · Kintampo", trailing: <PriorityBadge priority="emergency" />, to: "clinician.emergency" },
      { name: "Esi Quaye", role: "Referral · fever, rash", trailing: <PriorityBadge priority="urgent" />, to: "clinician.patient" },
      { name: "Yaw Owusu", role: "Referral · cough", trailing: <PriorityBadge priority="routine" />, to: "clinician.patient" },
    ]} />
  </>) },
  "clinician.emergency": { title: "Emergency", caption: "Kofi Danso", render: () => (<>
    <EscalationTimeline steps={[{ label: "Raised", who: "Ama S.", time: "8:21 am", state: "done" }, { label: "Notified", who: "You", time: "8:21 am", state: "done" }, { label: "Acknowledged", state: "waiting" }]} />
    <PrimaryButton>I'm on it</PrimaryButton>
    <SecondaryButton onClick={() => go("clinician.call")}>Start a call</SecondaryButton>
  </>) },
  "clinician.prescribe": { title: "Prescribe", render: () => <Prescribe /> },
};

/* ---------------- Pharmacist ---------------- */
function Verify() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<"none" | "ok" | "bad">("none");
  return (<>
    <Field label="Verification code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} helper="Type the code or scan the QR (scanner arrives with the prescription step)" />
    <PrimaryButton disabled={code.trim() === ""} onClick={() => setResult(code.replace(/\s/g, "") === "55031187" ? "ok" : "bad")}>Check code</PrimaryButton>
    {result === "ok" && <PrescriptionCard medicine="Amlodipine 5 mg" dose="1 tablet each morning" duration="30 days" prescriber="Dr. Kofi Mensah" licence="MDC-00000" code="5503 1187" status="issued" />}
    {result === "bad" && <p role="alert" className="field-note has-error">That code isn't valid. Ask the patient to check it. Test code: 5503 1187.</p>}
  </>);
}
export const pharmacist: Record<string, ScreenDef> = {
  "pharmacist.verify": { title: "Verify a prescription", render: () => <Verify /> },
  "pharmacist.queue": { title: "Queue", render: () => <Rows items={[{ name: "Akosua Boateng", role: "Amlodipine 5 mg", trailing: <SyncBadge status="saved" /> }, { name: "Esi Quaye", role: "Paracetamol 500 mg", trailing: <SyncBadge status="sent" /> }]} /> },
  "pharmacist.stock": { title: "Stock", render: () => (<><Rows items={[{ name: "Amlodipine 5 mg", role: "120 tablets" }, { name: "Paracetamol 500 mg", role: "14 tablets", trailing: <RangeFlag flag="check" /> }]} /><TestMode what="The pharmacy network" /></>) },
};

/* ---------------- Traditional healer ---------------- */
export const healer: Record<string, ScreenDef> = {
  "healer.home": { title: "Hi Nana Yaw", caption: "Referrals from the clinic", render: () => (<Rows items={[{ name: "Efua Mensima", role: "Referred with her consent", hours: "Today", to: "healer.patients" }]} />) },
  "healer.patients": { title: "Patients", caption: "Only people who agreed", render: () => (<><Rows items={[{ name: "Efua Mensima", role: "Back pain · consented" }]} /><SecondaryButton>Refer back to the clinic</SecondaryButton></>) },
  "healer.remedies": { title: "Remedies in use", render: () => (<><Rows items={[{ name: "Neem leaf tea", role: "Used by 3 patients" }]} /><Field label="Add a remedy" voice /><PrimaryButton>Save</PrimaryButton></>) },
};

/* ---------------- GHS official ---------------- */
export const ghs: Record<string, ScreenDef> = {
  "ghs.dashboard": { title: "Hi Adwoa", caption: "Greater Accra · this week", render: () => (<>
    <div className="row"><VitalCard label="New cases" value="148" unit="" taken="Last 7 days" /><VitalCard label="Malaria" value="+38%" unit="" taken="vs last month" flag="check" /></div>
    <Rows items={[{ name: "Possible outbreak: cholera", role: "Ga East, 12 cases", trailing: <PriorityBadge priority="urgent" />, to: "ghs.alerts" }]} />
    <TestMode what="This dashboard" />
  </>) },
  "ghs.map": { title: "Disease map", render: () => (<><div className="tile-grid">{["Ga East", "Ga West", "Adenta", "Dodowa"].map((d, i) => <div key={d} className="tile"><span className="heading">{[12, 4, 9, 2][i]}</span><span className="tile-label">{d}</span></div>)}</div><p className="caption">Cases by district. A real map arrives with the surveillance step.</p></>) },
  "ghs.alerts": { title: "Outbreak alerts", render: () => (<><Rows items={[{ name: "Cholera · Ga East", role: "12 cases, baseline 3", trailing: <PriorityBadge priority="urgent" /> }]} /><PrimaryButton>Confirm and alert the area</PrimaryButton><SecondaryButton>Not an outbreak</SecondaryButton></>) },
  "ghs.policy": { title: "Policy dashboard", render: () => (<><KV k="Rural specialist visits" v="+120%" /><KV k="Maternal visits kept" v="82%" /><KV k="Emergency response" v="31 min" /><Tiles items={[{ icon: "calendar-check", label: "SDG 3", to: "ghs.sdg" }]} /><SecondaryButton>Export (DHIS2 test)</SecondaryButton></>) },
  "ghs.sdg": { title: "SDG 3 impact", render: () => (<><KV k="Maternal complications" v="-12%" /><KV k="People with cover" v="41%" /><KV k="Rural vs urban gap" v="-8 pts" /><TestMode what="These indicators" /></>) },
};

/* ---------------- Health centre admin ---------------- */
export const facility: Record<string, ScreenDef> = {
  "facility.home": { title: "Hi Kwabena", caption: "Dodowa clinic area", render: () => (<><div className="row"><VitalCard label="People" value="14" unit="" taken="Volunteers and staff" /><VitalCard label="Low stock" value="3" unit="items" taken="Needs a request" flag="check" /></div><Tiles items={[{ icon: "users", label: "Reports", to: "facility.reports" }]} /></>) },
  "facility.users": { title: "People", render: () => (<><Rows items={[{ name: "Ama Serwaa", role: "Community health volunteer" }, { name: "Nurse Adjei", role: "Nurse" }]} /><PrimaryButton>Add a person</PrimaryButton></>) },
  "facility.stock": { title: "Stock", render: () => (<><Rows items={[{ name: "ORS sachets", role: "40 left", trailing: <RangeFlag flag="check" /> }, { name: "Test kits", role: "200 left" }]} /><PrimaryButton>Request stock</PrimaryButton></>) },
  "facility.training": { title: "Training", render: () => <Rows items={[{ name: "Safe home visits", role: "9 of 14 finished" }, { name: "Recording vitals", role: "14 of 14 finished" }]} /> },
  "facility.reports": { title: "Reports", render: () => (<><KV k="Visits this month" v="212" /><KV k="Referrals" v="17" /><SecondaryButton>Export (DHIS2 test)</SecondaryButton></>) },
};

/* ---------------- Platform admin ---------------- */
export const platform: Record<string, ScreenDef> = {
  "platform.users": { title: "Users", render: () => (<><Rows items={[{ name: "Ama Serwaa", role: "chv" }, { name: "Dr. Kofi Mensah", role: "clinician" }]} /><PrimaryButton>Add a user</PrimaryButton></>) },
  "platform.roles": { title: "Roles", caption: "What each role can reach", render: () => (<><KV k="chv" v="patients, vitals, referrals" /><KV k="clinician" v="history, prescriptions" /><KV k="pharmacist" v="prescriptions only" /><KV k="ghs" v="anonymised totals only" /></>) },
  "platform.audit": { title: "Audit log", render: () => (<><Rows items={[{ name: "Dr. Kofi Mensah", role: "Read patient record", hours: "Today 8:02 am" }, { name: "Ama Serwaa", role: "Added vitals", hours: "Today 7:58 am" }]} /><p className="caption">Test mode: sample rows. The live log is read from the database.</p></>) },
  "platform.settings": { title: "Settings", render: () => (<><KV k="Emergency escalation after" v="5 minutes" /><KV k="Reminder language" v="Patient's own" /><Chip selected>Test mode on</Chip></>) },
};


