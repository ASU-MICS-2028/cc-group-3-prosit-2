import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { whenSyncIdle } from "../data/sync";
import { mockAuthApi } from "../auth/mockApi";
import { canOpen } from "../auth/roles";
import { SCREENS } from "../screens/registry";
import { setLang, t } from "../i18n";
import { tw } from "../i18n/tw";
import { ee } from "../i18n/ee";
import { dag } from "../i18n/dag";
import { ha } from "../i18n/ha";

const PHRASE = "blue goat river morning";

/** Shown on screen but not UI text: synthetic people, places, medicines and other data, and language names. */
const DATA = [
  /^(English|Twi|Ewe|Dagbani|Hausa)$/,
  /Ama|Akosua|Kofi|Mensah|Efua|Darko|Nana Yaw|Adwoa|Kwabena|Team Admin|Serwaa|Boateng|Frimpong|Ofori|Asare/,
  /Dodowa|Korle Bu|Kintampo|Greater Accra|Accra|Ashanti|Volta|Ghana|Kumasi|Tamale|Test pharmacy/,
  /\(synthetic entry\)$/,                                   // healer directory rows
  /^[\w .]+ \d+ mg: \d+ tablets|^ORS sachets/,                // stock rows: medicine names and units
  / (patient|prescription|observation|consent|appointment|media) · /,   // audit rows name the record type by its code
  /cases of \w+ in .* in the week of/,                       // outbreak reason: text written by the surveillance service
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const twPatterns = Object.values(tw).filter(Boolean).map((v) => new RegExp(`^${escape(v).replace(/\\\{\w+\\\}/g, "[\\s\\S]*")}$`));
const isTwi = (s: string) => twPatterns.some((p) => p.test(s));
const ENGLISH = /\b(the|a|an|to|of|and|or|your|you|is|are|this|that|here|not|no|yet|with|for|on|in|it|be|can|will|has|have|was|we|our|my|me)\b/i;
const VOCAB = new Set(Object.keys(tw).flatMap((k) => k.toLowerCase().match(/[a-z]{4,}/g) ?? []));

/** Every visible text, aria-label and placeholder on the page that is English UI text without a Twi version. */
function untranslated(): string[] {
  const out: string[] = [];
  const check = (raw: string | null) => {
    const s = (raw ?? "").trim();
    if (!/[A-Za-z]{2,}/.test(s) || isTwi(s) || DATA.some((d) => d.test(s))) return;
    const words = s.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    if (s in tw || ENGLISH.test(s) || words.some((w) => VOCAB.has(w))) out.push(s);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement?.closest("script,style,[aria-hidden]")) check(n.textContent);
  for (const el of document.body.querySelectorAll("[aria-label],[placeholder]")) { check(el.getAttribute("aria-label")); check(el.getAttribute("placeholder")); }
  return out;
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 60)));

async function signIn(name: string) {
  render(<App />);
  fireEvent.click(await screen.findByText(name));
  await screen.findByText(t("Choose a passphrase"));
  fireEvent.change(screen.getByLabelText(t("Passphrase")), { target: { value: PHRASE } });
  fireEvent.change(screen.getByLabelText(t("Type it again")), { target: { value: PHRASE } });
  fireEvent.click(screen.getByRole("button", { name: t("Continue") }));
  await screen.findByText(t("Choose a PIN"));
  fireEvent.change(screen.getByLabelText(t("PIN (4 to 6 digits)")), { target: { value: "4821" } });
  fireEvent.change(screen.getByLabelText(t("Type it again")), { target: { value: "4821" } });
  fireEvent.click(screen.getByRole("button", { name: t("Save") }));
  await screen.findByRole("navigation");
}

beforeEach(async () => { await whenSyncIdle(); localStorage.clear(); navigate("/", { replace: true }); });
afterEach(() => { cleanup(); setLang("English"); });

describe("languages", () => {
  it("Ewe, Dagbani and Hausa have exactly Twi's keys", () => {
    const keys = Object.keys(tw).sort();
    for (const d of [ee, dag, ha]) expect(Object.keys(d).sort()).toEqual(keys);
  });

  it("every language file has the design system's test string", () => {
    const s = "Ɛyɛ, ɔhaw, ŋ, ɖ, ƒ, ɣ, ʋ, ʒ, ɓ, ɗ, ƙ, ƴ, ₵ 25.00";
    for (const d of [tw, ee, dag, ha]) expect(s in d).toBe(true);
  });

  it("missing entries fall back to English and placeholders are filled", () => {
    setLang("Ewe");
    expect(t("Sign out")).toBe("Sign out");
    expect(t("Hi {name}", { name: "Ama" })).toBe("Hi Ama");
    setLang("Twi");
    expect(t("Sign out")).toBe(tw["Sign out"]);
    expect(t("Hi {name}", { name: "Ama" })).toBe(tw["Hi {name}"].replace("{name}", "Ama"));
    expect(document.documentElement.lang).toBe("tw");
  });

  it("choosing Twi on Me re-renders the screen at once", async () => {
    await signIn("Ama Serwaa");
    act(() => navigate("/app/me"));
    fireEvent.click(await screen.findByRole("button", { name: "Twi" }));
    expect(await screen.findByRole("button", { name: tw["Sign out"] })).toBeTruthy();
    expect(screen.getByRole("navigation").textContent).toContain(tw["Patients"]);
    expect(document.documentElement.lang).toBe("tw");
  });

  // One sign-in per role, then every screen that role can open, in Twi.
  it.each(mockAuthApi.demoAccounts().map((a) => [a.role, a.name] as const))("every %s screen is in Twi", async (role, name) => {
    setLang("Twi");
    const missing = new Map<string, string>();
    await signIn(name);
    for (const s of untranslated()) missing.set(s, "login/home");
    for (const id of Object.keys(SCREENS).filter((id) => canOpen(role, id))) {
      act(() => navigate(`/app/${id}`));
      await settle(); await settle();
      for (const s of untranslated()) if (!missing.has(s)) missing.set(s, id);
    }
    expect([...missing].map(([s, id]) => `${id}: ${s}`)).toEqual([]);
  }, 120_000);

  it("a CHV patient's record pages are in Twi", async () => {
    setLang("Twi");
    await signIn("Ama Serwaa");
    act(() => navigate("/app/chv.register"));
    fireEvent.change(await screen.findByLabelText(t("Full name")), { target: { value: "Abena Mensah" } });
    fireEvent.change(screen.getByLabelText(t("Village or town")), { target: { value: "Dodowa" } });
    fireEvent.click(screen.getByRole("button", { name: t("Save and continue") }));
    fireEvent.click(await screen.findByRole("button", { name: t("I agree") }));
    await screen.findByText(t("Readings may be recorded"));
    const id = location.pathname.split("/").pop()!;
    const missing: string[] = [];
    for (const page of ["chv.consent", "chv.patient", "chv.vitals", "chv.referral", "chv.book", "chv.emergency"]) {
      act(() => navigate(`/app/${page}/${id}`));
      await settle(); await settle();
      missing.push(...untranslated().map((x) => `${page}: ${x}`));
    }
    expect([...new Set(missing)]).toEqual([]);
  }, 60_000);
});
