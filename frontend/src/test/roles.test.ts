import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROLES, TABS, canOpen, homeScreen, type Role } from "../auth/roles";
import { SCREENS } from "../screens/registry";

const ids = Object.keys(SCREENS);

describe("role navigation", () => {
  it("has eight roles", () => expect(ROLES).toHaveLength(8));

  it.each(ROLES)("%s: at most five tabs, each an existing screen the role may open", (role) => {
    expect(TABS[role].length).toBeLessThanOrEqual(5);
    expect(TABS[role].length).toBeGreaterThan(0);
    for (const t of TABS[role]) {
      expect(SCREENS[t.screen], t.screen).toBeDefined();
      expect(canOpen(role, t.screen), `${role} -> ${t.screen}`).toBe(true);
    }
    expect(SCREENS[homeScreen(role)]).toBeDefined();
  });

  it("a role cannot open another role's screens", () => {
    const own: Record<Role, string> = { chv: "chv", patient: "patient", clinician: "clinician", pharmacist: "pharmacist", healer: "healer", ghs: "ghs", facility_admin: "facility", platform_admin: "platform" };
    for (const role of ROLES) {
      for (const id of ids) {
        const family = id.split(".")[0];
        if (id === "me" || id === "sync") continue;
        expect(canOpen(role, id), `${role} -> ${id}`).toBe(family === own[role]);
      }
    }
  });

  it("everyone can open the shared screens; unknown or odd ids are refused", () => {
    for (const role of ROLES) {
      expect(canOpen(role, "me")).toBe(true);
      expect(canOpen(role, "sync")).toBe(true);
      expect(canOpen(role, "admin.secret")).toBe(false);
      expect(canOpen(role, "")).toBe(false);
      expect(canOpen(role, "../chv.today")).toBe(false);
    }
  });

  it("every role has at least one screen of its own", () => {
    for (const fam of ["chv", "patient", "clinician", "pharmacist", "healer", "ghs", "facility", "platform"]) {
      expect(ids.filter((i) => i.startsWith(`${fam}.`)).length, fam).toBeGreaterThan(0);
    }
  });

  it("no screen is orphaned: each one is a tab or is linked from another screen", () => {
    const dir = join(__dirname, "../screens");
    const src = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    const tabs = new Set(Object.values(TABS).flat().map((t) => t.screen));
    for (const id of ids) {
      if (tabs.has(id)) continue;
      const linked = new RegExp(`(to: "${id}"|go\\("${id}"\\)|to="${id}")`).test(src);
      expect(linked, `${id} is not reachable`).toBe(true);
    }
  });

  it("every linked screen id exists", () => {
    const dir = join(__dirname, "../screens");
    const src = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    for (const m of src.matchAll(/(?:to: "|go\(")([a-z]+(?:\.[a-z]+)?)"/g)) expect(SCREENS[m[1]], m[1]).toBeDefined();
  });
});
