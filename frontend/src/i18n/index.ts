import { useSyncExternalStore } from "react";
import { tw } from "./tw";
import { ee } from "./ee";
import { dag } from "./dag";
import { ha } from "./ha";

/** The five languages of the brief. The key is what the Me screen shows and what is saved on the phone. */
export const LANGS = { English: "en", Twi: "tw", Ewe: "ee", Dagbani: "dag", Hausa: "ha" } as const;
export type Lang = keyof typeof LANGS;
const DICTS: Record<Lang, Record<string, string>> = { English: {}, Twi: tw, Ewe: ee, Dagbani: dag, Hausa: ha };
const KEY = "hc.lang.v1";

const read = (): Lang => { try { const v = localStorage.getItem(KEY); return v && v in LANGS ? (v as Lang) : "English"; } catch { return "English"; } };
let lang: Lang = read();
const subs = new Set<() => void>();
const setHtmlLang = () => { if (typeof document !== "undefined") document.documentElement.lang = LANGS[lang]; };
setHtmlLang();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked: the choice lasts until reload */ }
  setHtmlLang();
  subs.forEach((f) => f());
}

/** Re-renders the caller when the language changes. Used once, at the top of the app. */
export const useLang = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getLang);

/** Looks up UI text by its English wording. A missing or empty entry falls back to English.
 *  `{name}` placeholders are filled from `vars`. Never pass patient data, names or codes as the key. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][en] || en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
