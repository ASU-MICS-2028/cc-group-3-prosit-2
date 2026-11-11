import { useMemo, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../components/buttons";
import { StateView } from "../components/display";
import { Icon } from "../components/icons";
import { Field } from "../components/inputs";
import { useSession } from "../auth/Session";
import { useLoad } from "../data/DataProvider";
import { InsuranceError, insuranceApiFor, type NhisResult } from "../data/insurance";
import { cedis } from "../data/payments";
import { Heading, KV } from "./kit";
import { PayForm, Receipts } from "./payments";
import { t } from "../i18n";

const Alert = ({ children }: { children: React.ReactNode }) => <p role="alert" className="field-note has-error"><Icon name="warning" size="sm" />{typeof children === "string" ? t(children) : children}</p>;
const NHIS_WORDS: Record<NhisResult["status"], string> = { active: "Active", expired: "Expired", not_found: "Not found" };

export function Insurance() {
  const { session } = useSession();
  const api = useMemo(() => insuranceApiFor(session!), [session]);
  const [version, setVersion] = useState(0);
  const data = useLoad(async () => ({ plans: await api.plans(), mine: await api.mine() }), [version]);
  const [problem, setProblem] = useState<string>();
  const [paying, setPaying] = useState(false);
  const [changing, setChanging] = useState(false);
  const [paid, setPaid] = useState(0);
  const [member, setMember] = useState("");
  const [nhis, setNhis] = useState<NhisResult>();
  const say = (e: unknown) => setProblem(e instanceof InsuranceError ? e.message : "We couldn't do that. Please try again.");

  async function enrol(planId: string) {
    setProblem(undefined);
    try { await api.enrol(planId); setChanging(false); setVersion((v) => v + 1); } catch (e) { say(e); }
  }
  async function check() {
    setProblem(undefined); setNhis(undefined);
    try { setNhis(await api.checkNhis(member)); } catch (e) { say(e); }
  }
  if (data.loading) return <StateView kind="loading" text={t("Loading…")} />;
  if (data.error) return <Alert>{data.error}</Alert>;
  const { plans, mine } = data.data!;
  const plan = plans.find((p) => p.id === mine?.planId);

  return (<>
    {plan && mine && !changing
      ? <>
        <KV k={t("Your plan")} v={t(plan.name)} /><KV k={t("Covers")} v={t(plan.covers)} /><KV k={t("Premium")} v={t("{cedis} a month", { cedis: cedis(plan.monthlyPremium) })} />
        {paying
          ? <PayForm purpose="insurance_premium" subjectId={mine.id} amount={plan.monthlyPremium} onDone={() => setPaid((n) => n + 1)} />
          : <PrimaryButton onClick={() => setPaying(true)}>{t("Pay this month's premium")}</PrimaryButton>}
        <SecondaryButton onClick={() => setChanging(true)}>{t("Change plan")}</SecondaryButton>
        <Receipts refreshKey={paid} />
      </>
      : <>
        <Heading>{t("Choose a plan")}</Heading>
        {plans.map((p) => (
          <div key={p.id} className="stack">
            <KV k={p.name} v={t("{cedis} a month", { cedis: cedis(p.monthlyPremium) })} />
            <p className="caption">{t(p.covers)}</p>
            <SecondaryButton onClick={() => void enrol(p.id)}>{t("Join {name}", { name: t(p.name) })}</SecondaryButton>
          </div>
        ))}
      </>}
    <Heading>{t("NHIS membership")}</Heading>
    <Field label={t("NHIS member number")} inputMode="numeric" value={member} onChange={(e) => setMember(e.target.value)} helper={t("Test numbers have 8 digits")} />
    <SecondaryButton disabled={member.trim() === ""} onClick={() => void check()}>{t("Check membership")}</SecondaryButton>
    {nhis && <KV k={t("NHIS status (test)")} v={NHIS_WORDS[nhis.status]} />}
    {problem && <Alert>{problem}</Alert>}
    <p className="caption">{t("Test mode: the plans, prices and NHIS check are made up. We aren't connected to the real NHIS or an insurer, and no real money moves.")}</p>
  </>);
}
