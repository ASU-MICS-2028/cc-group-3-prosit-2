import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sdg3 } from "../screens/admin";
import { AdminError, httpAdminApi, mockAdminApi } from "../data/admin";
import { canOpen } from "../auth/roles";
import type { Session } from "../auth/types";

const session = (role: Session["user"]["role"], id = "00000000-0000-4000-8000-000000000008"): Session => ({ token: "t", mode: "test", user: { id, name: "T", role } });

const fake = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../auth/Session", () => ({ useSession: () => ({ session: fake.session, user: (fake.session as Session | null)?.user }) }));
vi.mock("../data/DataProvider", () => ({ useLoad: <T,>(load: () => Promise<T>) => {
  const [state, set] = useState<{ data?: T; loading: boolean }>({ loading: true });
  useEffect(() => { void load().then((data) => set({ data, loading: false })); }, []);
  return state;
} }));

describe("the SDG 3 page and facility limit in test mode", () => {
  const person = (role: Session["user"]["role"], facility?: string): Session => ({ token: "t", mode: "test", user: { id: "x", name: "T", role, ...(facility ? { facility } : {}) } });

  it("says what each figure counts, says what is left out, and saves a labelled file", async () => {
    fake.session = person("ghs");
    const create = vi.fn((_: Blob) => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Sdg3 />);
    expect(await screen.findByText(/it counts every patient record held/)).toBeTruthy();
    expect(screen.getByText("Maternal mortality ratio (3.1.1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /FHIR-shaped/ }));
    expect((await screen.findByRole("status")).textContent).toMatch(/SANDBOX.*FHIR-shaped, not FHIR-compatible/);
    expect(click).toHaveBeenCalled();
    const file = JSON.parse(await create.mock.calls[0]![0].text()) as { notice: { sandbox: boolean; synthetic: boolean } };
    expect(file.notice).toMatchObject({ sandbox: true, synthetic: true });
    vi.unstubAllGlobals();
    click.mockRestore();
  });
  it("gives a facility admin only their facility, and no national figures", async () => {
    const api = mockAdminApi(person("facility_admin", "Dodowa clinic area"));
    expect((await api.sdg3()).scope).toBe("Dodowa clinic area");
    expect((await api.sdg3()).figures.map((f) => f.code)).not.toContain("patients_registered");
    expect((await api.facilityPeople()).people.map((p) => p.name).sort()).toEqual(["Ama Serwaa", "Kwabena Ofori"]);
  });
  it("refuses roles that have no reports", async () => {
    await expect(mockAdminApi(person("chv")).sdg3()).rejects.toMatchObject({ code: "forbidden" });
    await expect(mockAdminApi(person("ghs")).facilityPeople()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("test-mode admin", () => {
  beforeEach(() => localStorage.clear());
  const admin = mockAdminApi(session("platform_admin"));

  it("lists all eight demo accounts, and switches one off and on", async () => {
    const users = await admin.users();
    expect(users).toHaveLength(8);
    const someone = users.find((u) => u.role === "chv")!;
    await admin.setActive(someone.id, false);
    expect((await admin.users()).find((u) => u.id === someone.id)!.active).toBe(false);
    await admin.setActive(someone.id, true);
    expect((await admin.users()).find((u) => u.id === someone.id)!.active).toBe(true);
  });
  it("won't let an admin switch themselves off", async () => {
    await expect(admin.setActive("00000000-0000-4000-8000-000000000008", false)).rejects.toMatchObject({ code: "not_yourself" });
  });
  it("refuses any other role", async () => {
    const chv = mockAdminApi(session("chv", "x"));
    await expect(chv.users()).rejects.toBeInstanceOf(AdminError);
    await expect(chv.audit()).rejects.toMatchObject({ code: "forbidden" });
    await expect(chv.revenue()).rejects.toMatchObject({ code: "forbidden" });
    expect(canOpen("chv", "platform.revenue")).toBe(false);
    expect(canOpen("platform_admin", "platform.revenue")).toBe(true);
  });
  it("filters the audit log, which names no patient", async () => {
    expect((await admin.audit("denied")).items.every((i) => i.outcome === "denied")).toBe(true);
    expect(JSON.stringify(await admin.audit())).not.toContain("Akosua");
  });
  it("counts test payments as simulated, skipping failures", async () => {
    localStorage.setItem("hc.mock.payments.v1", JSON.stringify([{ purpose: "consultation_fee", status: "successful", amount: 25 }, { purpose: "consultation_fee", status: "failed", amount: 25 }]));
    expect((await admin.revenue()).lines).toEqual([{ purpose: "consultation_fee", simulated: true, payments: 1, total: 25 }]);
  });
});

describe("the live admin client", () => {
  it("calls the right paths, and passes on refusals", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    await httpAdminApi("t", "https://api.test").setActive("a", false);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.test/admin/users/a/deactivate");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not_yourself", message: "No" }), { status: 409 })));
    await expect(httpAdminApi("t").setActive("a", false)).rejects.toMatchObject({ code: "not_yourself" });
    vi.unstubAllGlobals();
  });
});
