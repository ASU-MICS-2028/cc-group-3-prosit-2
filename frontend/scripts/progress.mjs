// Counts the ticked boxes in BUILD-CHECKLIST.md, overall and per section.
import { readFileSync } from "node:fs";

const file = new URL("../../BUILD-CHECKLIST.md", import.meta.url);
const lines = readFileSync(file, "utf8").split("\n");

let section = "Top";
const rows = [];
let current = null;
for (const line of lines) {
  const h = line.match(/^## (.+)/);
  if (h) { section = h[1].replace(/ ✅.*| 🔄.*/, ""); current = { section, done: 0, total: 0 }; rows.push(current); continue; }
  const box = line.match(/^- \[( |x)\]/);
  if (box && current) { current.total++; if (box[1] === "x") current.done++; }
}

const bar = (d, t) => "█".repeat(Math.round((d / t) * 20)).padEnd(20, "░");
const pct = (d, t) => `${Math.round((d / t) * 100)}%`.padStart(4);
for (const r of rows.filter((r) => r.total)) console.log(`${bar(r.done, r.total)} ${pct(r.done, r.total)}  ${String(r.done).padStart(2)}/${String(r.total).padEnd(2)}  ${r.section}`);

const all = rows.reduce((a, r) => ({ done: a.done + r.done, total: a.total + r.total }), { done: 0, total: 0 });
console.log(`\nOverall: ${all.done} of ${all.total} done (${pct(all.done, all.total).trim()})`);
