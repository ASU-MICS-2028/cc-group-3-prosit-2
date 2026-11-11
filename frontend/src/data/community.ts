import type { Session } from "../auth/types";
import { DISCLAIMER, SYMPTOMS, checkSymptoms, type Match, type Symptom } from "./symptomRules";

/** Surveys, maternal and child records, and symptom decision support (FB-7b). Live mode calls
 *  backend/src/routes/community.ts; test mode follows the same rules on this device. */

export type Question = { id: string; text: string; options: string[] };
export type Survey = { id: string; title: string; questions: Question[]; status: "open" | "closed" };
export type NewQuestion = { text: string; options: string[] };
export type SurveyResults = { total: number; questions: { text: string; counts: { option: string; count: number }[] }[] };
export type Visit = { id: string; label: string; dueOn: string; done: boolean };
export type Pregnancy = { id: string; patient: { id: string; name: string }; dueDate: string; status: string; visits: Visit[] };
export type Child = { id: string; mother: { id: string; name: string }; givenName: string; dateOfBirth: string; status: string; visits: Visit[] };
export type MaternalRecords = { pregnancies: Pregnancy[]; children: Child[] };
export type SymptomAnswer = { matches: Match[]; disclaimer: string };
export type Reminder = { visitId: string; who: string; label: string; dueOn: string; overdue: boolean };
export type Patientish = { id: string; name: string };

export class CommunityError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "CommunityError"; } }

export interface CommunityApi {
  surveys(): Promise<Survey[]>;
  buildSurvey(input: { id: string; title: string; questions: NewQuestion[] }): Promise<Survey>;
  closeSurvey(id: string): Promise<void>;
  answer(surveyId: string, id: string, answers: Record<string, string>): Promise<void>;
  results(surveyId: string): Promise<SurveyResults>;
  maternal(): Promise<MaternalRecords>;
  addPregnancy(input: { id: string; patient: Patientish; dueDate: string }): Promise<void>;
  addChild(input: { id: string; mother: Patientish; givenName: string; dateOfBirth: string }): Promise<void>;
  closeRecord(kind: "pregnancies" | "children", id: string, outcome: string): Promise<void>;
  visitDone(id: string): Promise<void>;
  checkSymptoms(symptoms: Symptom[]): Promise<SymptomAnswer>;
}

/** Visits not yet done that are overdue or due within a week, soonest first. */
export function dueReminders(m: MaternalRecords, today = new Date().toISOString().slice(0, 10)): Reminder[] {
  const week = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const of = (who: string, visits: Visit[]) => visits.filter((v) => !v.done && v.dueOn <= week).map((v) => ({ visitId: v.id, who, label: v.label, dueOn: v.dueOn, overdue: v.dueOn < today }));
  return [...m.pregnancies.flatMap((p) => of(p.patient.name, p.visits)), ...m.children.flatMap((c) => of(`${c.givenName} (${c.mother.name})`, c.visits))]
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/* ---------------- Live mode ---------------- */

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api-hc.agroconnect.space";

export function liveCommunityApi(session: Session, base = API_URL): CommunityApi {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch {
      throw new CommunityError("offline", "No connection. This needs a signal; try again when you have one.");
    }
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) throw new CommunityError(data.error ?? `http_${res.status}`, data.message ?? "We couldn't do that. Please try again.");
    return data as T;
  }
  return {
    surveys: async () => (await call<{ surveys: Survey[] }>("/surveys")).surveys,
    buildSurvey: (i) => call("/surveys", i),
    closeSurvey: (id) => call(`/surveys/${id}/close`, {}),
    answer: (surveyId, id, answers) => call(`/surveys/${surveyId}/answers`, { id, answers }),
    results: (surveyId) => call(`/surveys/${surveyId}/results`),
    maternal: () => call("/maternal"),
    addPregnancy: (i) => call("/maternal/pregnancies", { id: i.id, patient_id: i.patient.id, expected_due_date: i.dueDate }),
    addChild: (i) => call("/maternal/children", { id: i.id, mother_id: i.mother.id, given_name: i.givenName, date_of_birth: i.dateOfBirth }),
    closeRecord: (kind, id, outcome) => call(`/maternal/${kind}/${id}/close`, { outcome }),
    visitDone: (id) => call(`/maternal/visits/${id}/done`, {}),
    checkSymptoms: (symptoms) => call("/decision-support/symptoms", { symptoms }),
  };
}

/* ---------------- Test mode ---------------- */

const KEY = "hc.mock.community.v1";
type Store = { surveys: Survey[]; answers: { id: string; surveyId: string; answers: Record<string, string> }[]; pregnancies: Pregnancy[]; children: Child[] };
const empty = (): Store => ({ surveys: [], answers: [], pregnancies: [], children: [] });
const load = (): Store => { try { return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Store>) }; } catch { return empty(); } };
const save = (s: Store) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } };
const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
// The same illustrative timings as the server (community.ts): not reviewed by a clinician.
const ANTENATAL_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40];
const CHILD_VISITS: [number, string][] = [[0, "Birth visit"], [42, "6-week visit"], [70, "10-week visit"], [98, "14-week visit"], [183, "6-month visit"], [274, "9-month visit"], [548, "18-month visit"]];
const ahead = (dates: [string, string][]): Visit[] => dates.filter(([d]) => d >= todayIso()).map(([dueOn, label]) => ({ id: crypto.randomUUID(), label, dueOn, done: false }));

export function mockCommunityApi(session: Session): CommunityApi {
  const { user } = session;
  const allow = (roles: string[], doing: string) => { if (!roles.includes(user.role)) throw new CommunityError("forbidden", `A ${user.role} account cannot ${doing}.`); };
  const CARE = ["chv", "clinician"];
  const change = (s: Store, kind: "pregnancies" | "children", id: string, outcome: string) => {
    const list: (Pregnancy | Child)[] = s[kind];
    const rec = list.find((r) => r.id === id);
    if (!rec) throw new CommunityError("not_found", "That record doesn't exist.");
    if (rec.status !== "active") throw new CommunityError("refused", "This record is already closed.");
    rec.status = outcome;
  };
  return {
    async surveys() {
      if (![...CARE, "ghs"].includes(user.role)) throw new CommunityError("forbidden", `A ${user.role} account cannot see surveys.`);
      const all = load().surveys;
      return user.role === "ghs" ? all : all.filter((x) => x.status === "open");
    },
    async buildSurvey(i) {
      allow(["ghs"], "build a survey");
      const s = load();
      const again = s.surveys.find((x) => x.id === i.id);
      if (again) return again;
      const survey: Survey = { id: i.id, title: i.title, status: "open", questions: i.questions.map((q, n) => ({ id: `q${n + 1}`, text: q.text, options: q.options })) };
      s.surveys.unshift(survey);
      save(s);
      return survey;
    },
    async closeSurvey(id) {
      allow(["ghs"], "close a survey");
      const s = load();
      const survey = s.surveys.find((x) => x.id === id);
      if (survey) survey.status = "closed";
      save(s);
    },
    async answer(surveyId, id, answers) {
      allow(CARE, "record survey answers");
      const s = load();
      if (s.answers.some((a) => a.id === id)) return;
      const survey = s.surveys.find((x) => x.id === surveyId);
      if (!survey || survey.status !== "open") throw new CommunityError("refused", "This survey is closed.");
      if (Object.keys(answers).length !== survey.questions.length || survey.questions.some((q) => !q.options.includes(answers[q.id]))) throw new CommunityError("refused", "Answer every question, using one of its options.");
      s.answers.push({ id, surveyId, answers });
      save(s);
    },
    async results(surveyId) {
      allow(["ghs"], "see survey results");
      const s = load();
      const survey = s.surveys.find((x) => x.id === surveyId);
      if (!survey) throw new CommunityError("not_found", "That survey doesn't exist.");
      const rows = s.answers.filter((a) => a.surveyId === surveyId);
      return { total: rows.length, questions: survey.questions.map((q) => ({ text: q.text, counts: q.options.map((option) => ({ option, count: rows.filter((r) => r.answers[q.id] === option).length })) })) };
    },
    async maternal() {
      if (![...CARE, "patient"].includes(user.role)) throw new CommunityError("forbidden", `A ${user.role} account cannot see maternal records.`);
      const s = load();
      const mine = (id: string) => user.role !== "patient" || id === user.patientId;
      return { pregnancies: s.pregnancies.filter((p) => p.status === "active" && mine(p.patient.id)), children: s.children.filter((c) => c.status === "active" && mine(c.mother.id)) };
    },
    async addPregnancy(i) {
      allow(CARE, "add a pregnancy");
      const s = load();
      if (s.pregnancies.some((p) => p.id === i.id)) return;
      if (i.dueDate < addDays(todayIso(), -14) || i.dueDate > addDays(todayIso(), 300)) throw new CommunityError("refused", "The expected due date must be within the next 43 weeks.");
      if (s.pregnancies.some((p) => p.status === "active" && p.patient.id === i.patient.id)) throw new CommunityError("refused", "This person already has an active pregnancy record.");
      s.pregnancies.push({ id: i.id, patient: i.patient, dueDate: i.dueDate, status: "active", visits: ahead(ANTENATAL_WEEKS.map((w) => [addDays(i.dueDate, -(40 - w) * 7), `${w}-week antenatal visit`])) });
      save(s);
    },
    async addChild(i) {
      allow(CARE, "add a child");
      const s = load();
      if (s.children.some((c) => c.id === i.id)) return;
      if (i.dateOfBirth > todayIso() || i.dateOfBirth < addDays(todayIso(), -1826)) throw new CommunityError("refused", "Child records are for children under 5: check the date of birth.");
      s.children.push({ id: i.id, mother: i.mother, givenName: i.givenName, dateOfBirth: i.dateOfBirth, status: "active", visits: ahead(CHILD_VISITS.map(([d, label]) => [addDays(i.dateOfBirth, d), label])) });
      save(s);
    },
    async closeRecord(kind, id, outcome) {
      allow(CARE, "close this record");
      const s = load();
      change(s, kind, id, outcome);
      save(s);
    },
    async visitDone(id) {
      allow(CARE, "mark a visit");
      const s = load();
      const visit = [...s.pregnancies, ...s.children].flatMap((r) => r.visits).find((v) => v.id === id);
      if (!visit) throw new CommunityError("not_found", "That visit doesn't exist.");
      visit.done = true;
      save(s);
    },
    async checkSymptoms(symptoms) {
      allow(CARE, "use decision support");
      if (symptoms.length === 0 || symptoms.some((x) => !(x in SYMPTOMS))) throw new CommunityError("invalid_request", "Choose at least one symptom from the list.");
      return { matches: checkSymptoms(symptoms), disclaimer: DISCLAIMER };
    },
  };
}

export const communityApiFor = (session: Session): CommunityApi => (session.mode === "live" ? liveCommunityApi(session) : mockCommunityApi(session));
