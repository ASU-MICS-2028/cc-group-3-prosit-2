import { useMemo, useState } from "react";
import { Chip, PrimaryButton, SecondaryButton, TextButton } from "../components/buttons";
import { StateView } from "../components/display";
import { Icon } from "../components/icons";
import { Field } from "../components/inputs";
import { EmergencyButton, PriorityBadge } from "../components/clinical";
import { useSession } from "../auth/Session";
import { useData, useLoad } from "../data/DataProvider";
import { CommunityError, communityApiFor, dueReminders, type Patientish, type Survey } from "../data/community";
import { listPatients } from "../data/repo";
import { DISCLAIMER, SYMPTOMS, checkSymptoms, type Match, type Symptom } from "../data/symptomRules";
import { Heading, KV, Rows, TestMode, go, type ScreenDef } from "./kit";
import { t } from "../i18n";

function useApi() {
  const { session } = useSession();
  return useMemo(() => communityApiFor(session!), [session]);
}
const Problem = ({ text }: { text?: string }) => (text ? <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{t(text)}</p> : null);
const say = (e: unknown) => (e instanceof CommunityError ? e.message : "We couldn't do that. Please try again.");
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

/* ---------------- Surveys: answer (CHV) ---------------- */

export function SurveyAnswer() {
  const api = useApi();
  const [version, setVersion] = useState(0);
  const list = useLoad(() => api.surveys(), [version]);
  const [survey, setSurvey] = useState<Survey>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [sent, setSent] = useState(0);
  if (list.error) return <StateView kind="error" text={list.error} />;
  if (!list.data) return <StateView kind="loading" text={t("Loading surveys…")} />;
  if (!survey) {
    if (list.data.length === 0) return <StateView kind="empty" text={t("No surveys open right now. A GHS official builds them.")} />;
    return (<>
      {sent > 0 && <p role="status" className="caption">{t("Thanks. {sent} sent.", { sent })}</p>}
      <div className="stack">{list.data.map((s) => <SecondaryButton key={s.id} onClick={() => { setSurvey(s); setAnswers({}); }}>{s.title}</SecondaryButton>)}</div>
    </>);
  }
  const complete = survey.questions.every((q) => answers[q.id]);
  async function send() {
    setBusy(true); setProblem(undefined);
    try {
      await api.answer(survey!.id, crypto.randomUUID(), answers);
      setSent((n) => n + 1); setSurvey(undefined); setVersion((v) => v + 1);
    } catch (e) { setProblem(say(e)); } finally { setBusy(false); }
  }
  return (<>
    <Heading>{survey.title}</Heading>
    {survey.questions.map((q) => (
      <section key={q.id} className="stack">
        <p className="body-strong">{q.text}</p>
        <div className="chip-row">{q.options.map((o) => <Chip key={o} selected={answers[q.id] === o} onClick={() => setAnswers({ ...answers, [q.id]: o })}>{o}</Chip>)}</div>
      </section>))}
    <p className="caption">{t("Answers are anonymous. Don't write anyone's name.")}</p>
    <Problem text={problem} />
    <PrimaryButton disabled={!complete} loading={busy} onClick={send}>{t("Save answer")}</PrimaryButton>
    <SecondaryButton onClick={() => setSurvey(undefined)}>{t("Back")}</SecondaryButton>
  </>);
}

/* ---------------- Surveys: build and see totals (GHS official) ---------------- */

export function SurveyBuilder() {
  const api = useApi();
  const [version, setVersion] = useState(0);
  const list = useLoad(() => api.surveys(), [version]);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([{ text: "", options: "" }]);
  const [problem, setProblem] = useState<string>();
  const [opened, setOpened] = useState<string>();
  const results = useLoad(async () => (opened ? api.results(opened) : undefined), [opened, version]);
  const ready = title.trim() && questions.every((q) => q.text.trim() && q.options.split(",").filter((o) => o.trim()).length >= 2);

  async function build() {
    setProblem(undefined);
    try {
      await api.buildSurvey({ id: crypto.randomUUID(), title: title.trim(), questions: questions.map((q) => ({ text: q.text.trim(), options: [...new Set(q.options.split(",").map((o) => o.trim()).filter(Boolean))] })) });
      setTitle(""); setQuestions([{ text: "", options: "" }]); setVersion((v) => v + 1);
    } catch (e) { setProblem(say(e)); }
  }
  async function close(id: string) {
    try { await api.closeSurvey(id); setVersion((v) => v + 1); } catch (e) { setProblem(say(e)); }
  }
  return (<>
    <Heading>{t("New survey")}</Heading>
    <Field label={t("Title")} value={title} onChange={(e) => setTitle(e.target.value)} />
    {questions.map((q, i) => (
      <section key={i} className="stack">
        <Field label={t("Question {n}", { n: i + 1 })} value={q.text} onChange={(e) => setQuestions(questions.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)))} />
        <Field label={t("Answers to choose from, separated by commas")} placeholder={t("Yes, No, Not sure")} value={q.options} onChange={(e) => setQuestions(questions.map((x, n) => (n === i ? { ...x, options: e.target.value } : x)))} />
      </section>))}
    <TextButton onClick={() => setQuestions([...questions, { text: "", options: "" }])}>{t("Add a question")}</TextButton>
    <p className="caption">{t("Choices only, so nobody's name ends up in the answers.")}</p>
    <Problem text={problem} />
    <PrimaryButton disabled={!ready} onClick={build}>{t("Build survey")}</PrimaryButton>
    <Heading>{t("Surveys")}</Heading>
    {list.error && <StateView kind="error" text={list.error} />}
    {list.data?.length === 0 && <StateView kind="empty" text={t("No surveys yet.")} />}
    {list.data?.map((s) => (
      <section key={s.id} className="stack">
        <KV k={s.status === "open" ? t("Open") : t("Closed")} v={s.title} />
        <div className="row">
          <SecondaryButton onClick={() => setOpened(opened === s.id ? undefined : s.id)}>{opened === s.id ? t("Hide totals") : t("See totals")}</SecondaryButton>
          {s.status === "open" && <SecondaryButton onClick={() => close(s.id)}>{t("Close survey")}</SecondaryButton>}
        </div>
        {opened === s.id && results.data && (<>
          <p className="caption">{t("{total} answered", { total: results.data.total })}</p>
          {results.data.questions.map((q) => <div key={q.text}><p className="body-strong">{q.text}</p>{q.counts.map((c) => <KV key={c.option} k={c.option} v={c.count} />)}</div>)}
        </>)}
      </section>))}
  </>);
}

/* ---------------- Mothers and babies ---------------- */

function PatientSelect({ patients, value, onChange }: { patients: Patientish[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor="maternal-mother">{t("Mother")}</label>
      <select id="maternal-mother" className="field-box" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("Choose")}</option>
        {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

export function MaternalRecords() {
  const api = useApi();
  const { session } = useSession();
  const { userId } = useData();
  const carer = session?.user.role !== "patient";
  const [version, setVersion] = useState(0);
  const records = useLoad(() => api.maternal(), [version]);
  const patients = useLoad(async () => (carer ? (await listPatients(userId)).map((v) => ({ id: v.resource.id, name: v.resource.name[0].text })) : []), [carer]);
  const [form, setForm] = useState<"pregnancy" | "child">();
  const [mother, setMother] = useState("");
  const [date, setDate] = useState("");
  const [givenName, setGivenName] = useState("");
  const [problem, setProblem] = useState<string>();

  if (records.error) return <StateView kind="error" text={records.error} />;
  if (!records.data) return <StateView kind="loading" text={t("Loading records…")} />;
  const data = records.data;
  const reminders = dueReminders(data);
  const refresh = () => setVersion((v) => v + 1);
  const act = async (work: () => Promise<void>) => { setProblem(undefined); try { await work(); refresh(); } catch (e) { setProblem(say(e)); } };
  const chosen = patients.data?.find((p) => p.id === mother);
  async function add() {
    if (!chosen) return;
    await act(async () => {
      if (form === "pregnancy") await api.addPregnancy({ id: crypto.randomUUID(), patient: chosen, dueDate: date });
      else await api.addChild({ id: crypto.randomUUID(), mother: chosen, givenName: givenName.trim(), dateOfBirth: date });
      setForm(undefined); setMother(""); setDate(""); setGivenName("");
    });
  }

  return (<>
    <Heading>{t("Due soon")}</Heading>
    {reminders.length === 0
      ? <p className="body">{t("No visits due in the next 7 days.")}</p>
      : <Rows items={reminders.map((r) => ({ name: r.who, role: r.label, hours: r.overdue ? t("Overdue, was {date}", { date: fmtDate(r.dueOn) }) : t("Due {date}", { date: fmtDate(r.dueOn) }),
          trailing: carer ? <TextButton onClick={() => act(() => api.visitDone(r.visitId))}>{t("Mark done")}</TextButton> : undefined }))} />}
    <Problem text={problem} />

    <Heading>{t("Mothers")}</Heading>
    {data.pregnancies.length === 0 && <p className="body">{t("No pregnancies recorded.")}</p>}
    {data.pregnancies.map((p) => (
      <section key={p.id} className="stack">
        <KV k={p.patient.name} v={t("Due {fmtDate}", { fmtDate: fmtDate(p.dueDate) })} />
        {carer && <div className="row"><TextButton onClick={() => act(() => api.closeRecord("pregnancies", p.id, "delivered"))}>{t("Baby born")}</TextButton><TextButton onClick={() => act(() => api.closeRecord("pregnancies", p.id, "ended"))}>{t("Pregnancy ended")}</TextButton><TextButton onClick={() => act(() => api.closeRecord("pregnancies", p.id, "entered_in_error"))}>{t("Added by mistake")}</TextButton></div>}
      </section>))}

    <Heading>{t("Children")}</Heading>
    {data.children.length === 0 && <p className="body">{t("No children recorded.")}</p>}
    {data.children.map((c) => (
      <section key={c.id} className="stack">
        <KV k={t("{givenName}, {name}'s child", { givenName: c.givenName, name: c.mother.name })} v={t("Born {fmtDate}", { fmtDate: fmtDate(c.dateOfBirth) })} />
        {carer && <TextButton onClick={() => act(() => api.closeRecord("children", c.id, "entered_in_error"))}>{t("Added by mistake")}</TextButton>}
      </section>))}

    {carer && (!form
      ? <div className="row"><SecondaryButton onClick={() => setForm("pregnancy")}>{t("Add a pregnancy")}</SecondaryButton><SecondaryButton onClick={() => setForm("child")}>{t("Add a child")}</SecondaryButton></div>
      : (<>
        <Heading>{form === "pregnancy" ? t("Add a pregnancy") : t("Add a child")}</Heading>
        <PatientSelect patients={patients.data ?? []} value={mother} onChange={setMother} />
        {form === "child" && <Field label={t("Child's given name")} value={givenName} onChange={(e) => setGivenName(e.target.value)} />}
        <Field label={form === "pregnancy" ? t("Expected due date") : t("Date of birth")} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <PrimaryButton disabled={!chosen || !date || (form === "child" && !givenName.trim())} onClick={add}>{t("Save")}</PrimaryButton>
        <SecondaryButton onClick={() => setForm(undefined)}>{t("Cancel")}</SecondaryButton>
      </>))}

    <p className="caption">{t("Visit times are a guide, based on WHO's 8 antenatal contacts and common childhood visit ages. They haven't been reviewed by a clinician; the clinic's plan and the child's card come first.")}</p>
    <p className="caption">{t("Reminders appear here in the app. SMS reminders aren't connected yet, so no text message is sent.")}</p>
    {session?.mode === "test" && <TestMode what={t("This record")} />}
  </>);
}

/* ---------------- Symptom decision support ---------------- */

export function SymptomCheck() {
  const api = useApi();
  const [selected, setSelected] = useState<Symptom[]>([]);
  const [matches, setMatches] = useState<Match[]>();
  const [problem, setProblem] = useState<string>();
  const { session } = useSession();
  const toggle = (s: Symptom) => { setSelected((all) => (all.includes(s) ? all.filter((x) => x !== s) : [...all, s])); setMatches(undefined); };
  async function run() {
    setProblem(undefined);
    try { setMatches((await api.checkSymptoms(selected)).matches); }
    catch (e) {
      // No signal: the same rules are on the phone, so the check still works.
      if (e instanceof CommunityError && e.code === "offline") setMatches(checkSymptoms(selected));
      else setProblem(say(e));
    }
  }
  return (<>
    <p className="body-strong"><Icon name="warning" size="sm" />{" "}{t("Decision support, not a diagnosis.")}</p>
    <p className="caption">{t(DISCLAIMER)}</p>
    <div className="chip-row">{(Object.keys(SYMPTOMS) as Symptom[]).map((s) => <Chip key={s} selected={selected.includes(s)} onClick={() => toggle(s)}>{SYMPTOMS[s]}</Chip>)}</div>
    <p className="caption">{t("Nothing here is saved, and no name is sent.")}</p>
    <Problem text={problem} />
    <PrimaryButton disabled={selected.length === 0} onClick={run}>{t("Check")}</PrimaryButton>
    {matches && (<>
      <Heading>{t("What the rules suggest")}</Heading>
      {matches.length === 0 && <p className="body">{t("No rule matched. That doesn't mean nothing is wrong: use your judgement.")}</p>}
      {matches.map((m) => (
        <section key={m.rule} className="stack">
          <div className="row"><PriorityBadge priority={m.priority} /><span className="body-strong">{t(m.possibility)}</span></div>
          <p className="body">{t(m.action)}</p>
          <p className="caption">{t("Rule: {rule}", { rule: m.rule })}</p>
        </section>))}
      {matches.some((m) => m.priority === "emergency") && session?.user.role === "chv" && <div className="stack"><EmergencyButton onClick={() => go("chv.emergency")} /></div>}
      <p className="caption">{t("Not a diagnosis. Not reviewed by a clinician.")}</p>
    </>)}
  </>);
}

export const communityScreens: Record<string, ScreenDef> = {
  "chv.survey": { title: "Health survey", render: () => <SurveyAnswer /> },
  "chv.maternal": { title: "Mothers & babies", render: () => <MaternalRecords /> },
  "chv.symptoms": { title: "Symptom check", caption: "Decision support, not a diagnosis", render: () => <SymptomCheck /> },
  "clinician.maternal": { title: "Mothers & babies", render: () => <MaternalRecords /> },
  "clinician.symptoms": { title: "Symptom check", caption: "Decision support, not a diagnosis", render: () => <SymptomCheck /> },
  "patient.maternal": { title: "My pregnancy and children", render: () => <MaternalRecords /> },
  "ghs.surveys": { title: "Surveys", render: () => <SurveyBuilder /> },
};
