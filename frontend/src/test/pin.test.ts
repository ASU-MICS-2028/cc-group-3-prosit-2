import { LOCK_AFTER_MS, shouldLock } from "../auth/lock";
import { MAX_ATTEMPTS, attemptsLeft, checkPin, clearPin, hasPin, isValidPin, setPin } from "../auth/pin";

const U = "user-1";
const V = "user-2";
beforeEach(() => localStorage.clear());

describe("PIN", () => {
  it("accepts 4 to 6 digits only", () => {
    for (const ok of ["1234", "12345", "123456"]) expect(isValidPin(ok)).toBe(true);
    for (const bad of ["", "123", "1234567", "12a4", "12 34", "١٢٣٤"]) expect(isValidPin(bad), bad).toBe(false);
  });

  it("refuses to save an invalid PIN", async () => {
    await expect(setPin(U, "12")).rejects.toThrow();
    expect(hasPin(U)).toBe(false);
  });

  it("stores a salted hash, never the PIN", async () => {
    await setPin(U, "4821");
    const stored = localStorage.getItem(`hc.pin.v1.${U}`)!;
    expect(stored).not.toContain("4821");
    expect(JSON.parse(stored)).toMatchObject({ iterations: expect.any(Number) });
  });

  it("the same PIN gets a different hash each time (salt)", async () => {
    await setPin(U, "4821"); const a = localStorage.getItem(`hc.pin.v1.${U}`);
    await setPin(U, "4821"); const b = localStorage.getItem(`hc.pin.v1.${U}`);
    expect(a).not.toBe(b);
  });

  it("right PIN unlocks, wrong PIN counts down", async () => {
    await setPin(U, "4821");
    expect(await checkPin(U, "4821")).toBe("ok");
    expect(await checkPin(U, "0000")).toBe("wrong");
    expect(attemptsLeft(U)).toBe(MAX_ATTEMPTS - 1);
    expect(await checkPin(U, "4821")).toBe("ok");        // a right PIN resets the count
    expect(attemptsLeft(U)).toBe(MAX_ATTEMPTS);
  });

  it("after five wrong tries the PIN is wiped and the user must sign in again", async () => {
    await setPin(U, "4821");
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) expect(await checkPin(U, "0000")).toBe("wrong");
    expect(await checkPin(U, "0000")).toBe("signed-out");
    expect(hasPin(U)).toBe(false);
    expect(await checkPin(U, "4821")).toBe("signed-out"); // the old PIN no longer works
  });

  it("checking with no PIN set means signed out, not a crash", async () => {
    expect(await checkPin(U, "1234")).toBe("signed-out");
    clearPin(U);
  });
});

describe("PINs belong to the person", () => {
  it("two people on one phone have separate PINs", async () => {
    await setPin(U, "4821");
    await setPin(V, "9999");
    expect(await checkPin(U, "4821")).toBe("ok");
    expect(await checkPin(V, "9999")).toBe("ok");
    expect(await checkPin(U, "9999")).toBe("wrong");
    expect(await checkPin(V, "4821")).toBe("wrong");
  });

  it("wiping one person's PIN leaves the other's alone", async () => {
    await setPin(U, "4821");
    await setPin(V, "9999");
    for (let i = 0; i < MAX_ATTEMPTS; i++) await checkPin(U, "0000");
    expect(hasPin(U)).toBe(false);
    expect(hasPin(V)).toBe(true);
    expect(attemptsLeft(V)).toBe(MAX_ATTEMPTS);
  });
});

describe("app lock timing", () => {
  it("locks after 5 minutes in the background, not before", () => {
    const t0 = 1_000_000;
    expect(shouldLock(t0, t0 + LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLock(t0, t0 + LOCK_AFTER_MS)).toBe(true);
    expect(shouldLock(t0, t0 + LOCK_AFTER_MS * 10)).toBe(true);
  });
  it("never locks if the app was not hidden", () => expect(shouldLock(null, Date.now())).toBe(false));
});
