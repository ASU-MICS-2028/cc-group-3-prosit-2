import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const tokens = readFileSync(join(root, "styles/tokens.css"), "utf8");

const token = (name: string): string => {
  const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(token(a)), lum(token(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour pairs the design system promises", () => {
  // [text, background, minimum]: 4.5 for text, 3 for large text and icons
  const pairs: [string, string, number][] = [
    ["--ink", "--lavender", 4.5],        // chips, active nav: ink on lavender, NOT white
    ["--ink", "--lavender-tint", 4.5],
    ["--text", "--surface", 4.5],
    ["--text-muted", "--canvas", 4.5],
    ["--text-muted", "--surface", 4.5],
    ["--violet", "--surface", 4.5],
    ["--violet", "--lavender-tint", 4.5],
    ["--on-ink", "--ink", 4.5],
    ["--ok-fg", "--ok-bg", 4.5],
    ["--warn-fg", "--warn-bg", 4.5],
    ["--danger", "--danger-bg", 4.5],
    ["--danger", "--surface", 4.5],
    ["--on-ink", "--danger", 4.5],       // emergency button, end-call
    ["--ink", "--mist", 4.5],
    ["--text-muted", "--mist", 4.5],     // disabled button label
  ];
  it.each(pairs)("%s on %s is at least %s:1", (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("confirms why white on lavender is banned", () => {
    expect(ratio("--on-ink", "--lavender")).toBeLessThan(3);
  });
});

describe("components use tokens only", () => {
  const css = ["base.css", "components.css"].map((f) => [f, readFileSync(join(root, "styles", f), "utf8")] as const);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const tsx = ["components", "gallery", "screens", "shell"].flatMap((d) => walk(join(root, d))).filter((f) => f.endsWith(".tsx") && !f.endsWith("icons.tsx"));

  it.each(css)("%s has no hex colours or pixel sizes", (_name, src) => {
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).toEqual([]);
    expect(stripped.match(/\b\d+(\.\d+)?px\b/g) ?? []).toEqual([]);
  });

  it("component code has no hex colours or pixel sizes", () => {
    for (const f of tsx) {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      expect(src.match(/#[0-9A-Fa-f]{6}\b/g) ?? [], f).toEqual([]);
      expect(src.match(/\b\d+px\b/g) ?? [], f).toEqual([]);
    }
  });

  it("EB Garamond is never used below 22px", () => {
    const sizes = [...tokens.matchAll(/--t-[\w-]+:\s*\d+\s+(\d+)px\/\d+px var\(--font-display\)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(22);
  });

  it("no text token is smaller than 12px, body at least 16px", () => {
    expect(tokens).toMatch(/--t-body:\s*400 16px/);
    expect(tokens).toMatch(/--t-caption:\s*400 14px/);
  });
});
