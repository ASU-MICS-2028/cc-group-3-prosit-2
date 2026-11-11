/** Text size (design system 11: works at 200%). Fonts are in rem, so this one root size scales all text. */
export const TEXT_SIZES = { Normal: "100%", Large: "150%", Largest: "200%" } as const;
export type TextSize = keyof typeof TEXT_SIZES;
const KEY = "hc.textsize.v1";

export function getTextSize(): TextSize {
  try { const v = localStorage.getItem(KEY); return v && v in TEXT_SIZES ? (v as TextSize) : "Normal"; } catch { return "Normal"; }
}
export function setTextSize(s: TextSize) {
  try { localStorage.setItem(KEY, s); } catch { /* storage blocked: lasts until reload */ }
  document.documentElement.style.fontSize = s === "Normal" ? "" : TEXT_SIZES[s];
}
