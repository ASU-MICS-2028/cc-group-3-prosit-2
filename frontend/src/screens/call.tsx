import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../components/buttons";
import { Field } from "../components/inputs";
import { Icon, type IconName } from "../components/icons";
import { LiveCall } from "../components/live";
import { StateView } from "../components/display";
import { useSession } from "../auth/Session";
import { useData } from "../data/DataProvider";
import { CALL_URL } from "../call/engine";
import { callCodeProblem } from "../data/validate";
import { adviseNetwork, canReachServer, currentNetwork, generateCode, normaliseCode, type NetworkAdvice } from "../call/network";
import { useCallEngine } from "../call/useCall";
import { go, Heading, type ScreenDef } from "./kit";

type Check = { label: string; state: "checking" | "ok" | "problem"; text: string; icon: IconName };

/** Looks at the phone before the call, so a problem is found on this screen and not halfway through a call. */
function usePreCheck(online: boolean, again: number) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [advice, setAdvice] = useState<NetworkAdvice>(() => adviseNetwork(currentNetwork(), online));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const net = adviseNetwork(currentNetwork(), online);
    setAdvice(net); setReady(false);
    const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined";
    const base: Check[] = [
      { label: "Secure page", state: secure ? "ok" : "problem", text: secure ? "Ready" : "Calls need a secure page (https). Use the secure address.", icon: "lock" },
      { label: "Signal", state: online ? "ok" : "problem", text: online ? net.text : "You're offline. A video visit needs a signal.", icon: "cell-signal-high" },
      { label: "Call server", state: online && secure ? "checking" : "problem", text: online && secure ? "Checking…" : "Not checked", icon: "phone" },
    ];
    setChecks(base);
    if (!online || !secure) { setReady(false); return; }
    (async () => {
      const reachable = await canReachServer(CALL_URL);
      let devices = true;
      try { const list = await navigator.mediaDevices.enumerateDevices(); devices = list.some((d) => d.kind === "audioinput"); } catch { /* unknown */ }
      if (!live) return;
      setChecks([
        base[0], base[1],
        { label: "Call server", state: reachable ? "ok" : "problem", text: reachable ? "Reachable" : "We couldn't reach the call server. Check your signal.", icon: "phone" },
        { label: "Microphone", state: devices ? "ok" : "problem", text: devices ? "Found" : "No microphone was found.", icon: "microphone" },
      ]);
      setReady(reachable && devices);
    })();
    return () => { live = false; };
  }, [online, again]);
  return { checks, advice, ready };
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checklist">
      {checks.map((c) => (
        <li key={c.label}>
          <Icon name={c.state === "ok" ? "check-circle" : c.state === "problem" ? "warning" : c.icon} size="sm" />
          <span className="body-strong">{c.label}</span>
          <span className="caption" role={c.state === "problem" ? "alert" : undefined}>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Code, then check, then the call, then a short "call ended" page. */
function CallFlow({ code: codeFromAddress }: { code?: string }) {
  const { user } = useSession();
  const { online } = useData();
  const { api, state } = useCallEngine();
  const [code, setCode] = useState(codeFromAddress ?? "");
  const [step, setStep] = useState<"code" | "check" | "call">(codeFromAddress ? "check" : "code");
  const [again, setAgain] = useState(0);
  const { checks, advice, ready } = usePreCheck(online, again);
  const cleanCode = normaliseCode(code);
  const joining = useRef(false);

  // Leaving this page ends the call and releases the camera and microphone.
  useEffect(() => () => { if (["starting", "waiting", "connecting", "connected", "reconnecting"].includes(api.getState().phase)) api.leave(); }, [api]);

  async function join(audioOnly: boolean) {
    if (joining.current || !user || !cleanCode) return;
    joining.current = true;
    setStep("call");
    try { await api.join({ room: cleanCode, name: user.name, audioOnly }); } finally { joining.current = false; }
  }

  const active = ["starting", "waiting", "connecting", "connected", "reconnecting"].includes(state.phase);
  if (step === "call" && active) return <LiveCall state={state} api={api} remoteLabel="the other person" />;

  if (step === "call" && (state.phase === "ended" || state.phase === "error")) {
    const mins = Math.floor(state.seconds / 60), secs = state.seconds % 60;
    return (<>
      <StateView kind={state.phase === "error" ? "error" : "empty"} plain text={state.message ?? "The call ended."} />
      {state.phase === "ended" && state.seconds > 0 && <p className="caption" style={{ textAlign: "center" }}>Call length: {mins} min {secs} s</p>}
      <PrimaryButton onClick={() => { setStep("check"); setAgain((n) => n + 1); }}>Call again</PrimaryButton>
      <SecondaryButton onClick={() => go(user?.role === "chv" ? "chv.care" : "me")}>Back</SecondaryButton>
    </>);
  }

  if (step === "code") {
    return (<>
      <p>A video visit needs a call code. One person makes the code and sends it to the other. Both type the same code.</p>
      <Field label="Call code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoCapitalize="none" autoComplete="off" helper="Capital letters and spaces don't matter" error={callCodeProblem(code) ?? undefined} />
      <SecondaryButton onClick={() => setCode(generateCode())}>Make a code</SecondaryButton>
      {cleanCode && typeof navigator.share === "function" && <SecondaryButton onClick={() => void navigator.share({ title: "HealthConnect video visit", text: `Join my HealthConnect video visit. Call code: ${cleanCode}` }).catch(() => undefined)}>Send the code…</SecondaryButton>}
      <PrimaryButton disabled={!cleanCode || !!callCodeProblem(code)} onClick={() => setStep("check")}>Continue</PrimaryButton>
    </>);
  }

  // step === "check"
  const blocked = !ready;
  const audioFirst = advice.recommendAudioOnly;
  return (<>
    <div className="precall">
      <h2 className="title-2">Before you join</h2>
      <p className="caption">Call code: <span className="body-strong tabular">{cleanCode}</span></p>
      <CheckList checks={checks} />
      {advice.level !== "good" && online && <p className="caption" role="status">{advice.text}</p>}
    </div>
    <PrimaryButton disabled={blocked} onClick={() => join(audioFirst)}>{audioFirst ? "Join with audio only" : "Join call"}</PrimaryButton>
    <SecondaryButton disabled={blocked} onClick={() => join(!audioFirst)}>{audioFirst ? "Join with video" : "Join with audio only"}</SecondaryButton>
    <SecondaryButton onClick={() => setAgain((n) => n + 1)}>Check again</SecondaryButton>
    {!codeFromAddress && <SecondaryButton onClick={() => setStep("code")}>Change the code</SecondaryButton>}
    <Heading>Tips</Heading>
    <p className="caption">Hold the phone steady and face a window. If the picture freezes, switch to audio only. You'll be asked to allow the camera and microphone.</p>
  </>);
}

const flow = (title: string): ScreenDef => ({ title, render: (code) => <CallFlow code={code} key={code ?? "new"} /> });
export const callScreens: Record<string, ScreenDef> = {
  "chv.call": flow("Video visit"),
  "patient.call": flow("Video visit"),
  "clinician.call": flow("Video visit"),
};
