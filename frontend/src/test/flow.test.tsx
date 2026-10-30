import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { navigate } from "../router";
import { LOCK_AFTER_MS } from "../auth/lock";
import { mockAuthApi } from "../auth/mockApi";
import { SessionProvider } from "../auth/Session";
import type { AuthApi } from "../auth/types";

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function signInAs(name: string, pin = "4821") {
  render(<App />);
  fireEvent.click(await screen.findByText(name));
  await screen.findByText("Choose a PIN");
  fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: pin } });
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: pin } });
  fireEvent.click(screen.getByRole("button", { name: "Save PIN" }));
}

beforeEach(() => { localStorage.clear(); navigate("/", { replace: true }); setVisibility("visible"); });

describe("sign-in to the app", () => {
  it("shows the test-mode account list when signed out", async () => {
    render(<App />);
    expect(await screen.findByText(/Test mode: these are made-up people/)).toBeTruthy();
    expect(screen.getAllByRole("button").length).toBe(8);
  });

  it("CHV signs in, sets a PIN, and sees only the CHV tabs", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const t of ["Today", "Patients", "Care", "Learn", "Me"]) expect(nav.textContent).toContain(t);
    expect(nav.textContent).not.toContain("Verify");
  });

  it("every screen shows who is signed in and their role under the name", async () => {
    await signInAs("Efua Darko");
    await screen.findByText("Verify a prescription");
    const who = screen.getByLabelText("Signed in as");
    expect(who.textContent).toContain("Efua Darko");
    expect(who.textContent).toContain("Pharmacist");
    act(() => navigate("/app/me"));
    await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getByLabelText("Signed in as").textContent).toContain("Pharmacist");
  });

  it("a pharmacist lands on Verify and a wrong code is refused", async () => {
    await signInAs("Efua Darko");
    await screen.findByText("Verify a prescription");
    fireEvent.change(screen.getByLabelText(/Verification code/), { target: { value: "1111 1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Check code" }));
    expect((await screen.findByRole("alert")).textContent).toContain("isn't valid");
  });

  it("typing another role's address shows 'no access', not their screen", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    act(() => navigate("/app/pharmacist.verify"));
    expect(await screen.findByText("You don't have access to that page.")).toBeTruthy();
    expect(screen.queryByText("Verify a prescription")).toBeNull();
  });

  it("an unknown page says so", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    act(() => navigate("/app/nothing.here"));
    expect(await screen.findByText("We couldn't find that page.")).toBeTruthy();
  });

  it("mismatched PINs are refused", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Akosua Boateng"));
    await screen.findByText("Choose a PIN");
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "4822" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(await screen.findByText("The two PINs are different.")).toBeTruthy();
  });
});

describe("switching accounts is a test-mode tool", () => {
  it("a live session shows no 'Switch account', only Sign out in Me", async () => {
    const live: AuthApi = { ...mockAuthApi, signIn: async (id) => ({ ...(await mockAuthApi.signIn(id)), mode: "live" }) };
    const { Routes } = await import("../App");
    render(<SessionProvider api={live}><Routes /></SessionProvider>);
    fireEvent.click(await screen.findByText("Ama Serwaa"));
    await screen.findByText("Choose a PIN");
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "4821" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    await screen.findByText("Hi Ama");
    expect(screen.queryByRole("button", { name: "Switch account" })).toBeNull();
    expect(screen.getByLabelText("Signed in as").textContent).toContain("Community health volunteer");
    act(() => navigate("/app/me"));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});

describe("switching accounts", () => {
  it("'Switch account' on every screen returns to the list, and another role gets its own PIN and tabs", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
    fireEvent.click(await screen.findByText("Dr. Kofi Mensah"));
    await screen.findByText("Choose a PIN");               // a new account sets its own PIN
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "7777" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "7777" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    await screen.findByText("Hi Dr. Mensah");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.textContent).toContain("Prescribe");
    expect(nav.textContent).not.toContain("Care");
    expect(screen.getByLabelText("Signed in as").textContent).toContain("Doctor, nurse or specialist");
  });

  it("one person's PIN does not open another person's account", async () => {
    await signInAs("Ama Serwaa", "4821");
    await screen.findByText("Hi Ama");
    fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
    fireEvent.click(await screen.findByText("Dr. Kofi Mensah"));
    await screen.findByText("Choose a PIN");
    fireEvent.change(screen.getByLabelText("PIN (4 to 6 digits)"), { target: { value: "7777" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "7777" } });
    fireEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    await screen.findByText("Hi Dr. Mensah");
    fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
    fireEvent.click(await screen.findByText("Ama Serwaa"));
    await screen.findByText("Enter your PIN");
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "7777" } });   // the doctor's PIN
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText(/4 tries left/);
  });
});

describe("app lock", () => {
  it("locks after 5 minutes away; the lock screen shows no name; the right PIN unlocks", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    const now = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(now); act(() => setVisibility("hidden"));
    spy.mockReturnValue(now + LOCK_AFTER_MS + 1000); act(() => setVisibility("visible"));
    await screen.findByText("Enter your PIN");
    expect(document.body.textContent).not.toContain("Ama");
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText("Hi Ama");
    spy.mockRestore();
  });

  it("does not lock after a short trip to another app", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    const now = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(now); act(() => setVisibility("hidden"));
    spy.mockReturnValue(now + 60_000); act(() => setVisibility("visible"));
    expect(screen.queryByText("Enter your PIN")).toBeNull();
    spy.mockRestore();
  });

  it("a wrong PIN says how many tries are left, and the fifth wrong one signs out", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    const now = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(now); act(() => setVisibility("hidden"));
    spy.mockReturnValue(now + LOCK_AFTER_MS + 1); act(() => setVisibility("visible"));
    await screen.findByText("Enter your PIN");
    for (let i = 1; i <= 4; i++) {
      fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "0000" } });
      fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
      await screen.findByText(new RegExp(`${5 - i} tries left`));
    }
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(screen.getByText(/Test mode: these are made-up people/)).toBeTruthy());
    expect(localStorage.getItem("hc.session.v1")).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("hc.pin.v1."))).toEqual([]);
    spy.mockRestore();
  });

  it("restarting the app with a saved session asks for the PIN first", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    document.body.innerHTML = "";
    render(<App />);
    expect(await screen.findByText("Enter your PIN")).toBeTruthy();
  });

  it("a damaged saved session means signed out, not a crash", async () => {
    localStorage.setItem("hc.session.v1", "{not json");
    render(<App />);
    expect(await screen.findByText(/Test mode: these are made-up people/)).toBeTruthy();
  });

  it("signing out ends the session but keeps the person's PIN, which is asked next time", async () => {
    await signInAs("Ama Serwaa");
    await screen.findByText("Hi Ama");
    act(() => navigate("/app/me"));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByText(/Test mode: these are made-up people/);
    expect(localStorage.getItem("hc.session.v1")).toBeNull();
    fireEvent.click(await screen.findByText("Ama Serwaa"));
    await screen.findByText("Enter your PIN");
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText("Hi Ama");
  });
});
