import { MIN_PASSPHRASE, passphraseProblem } from "../auth/passphrase";
import { DEFAULT_ITERATIONS } from "../data/vault";
import { MAX_ATTEMPTS, checkPin, recordFailure, resetAttempts, setPin, attemptsLeft } from "../auth/pin";

describe("passphrase rules", () => {
  it.each(["blue goat river morning", "Mama keeps 7 white hens", "mmm-ɛyɛ-ɔhaw-ŋɖƒ-ok"])("accepts %s", (p) => expect(passphraseProblem(p)).toBeNull());

  it.each([
    ["too short", "blue goat"],
    ["digits only", "1234567890"],
    ["one repeated letter", "aaaaaaaaaaaa"],
    ["a common password", "MyPassword2024"],
    ["the app's own name", "healthconnect1"],
    ["spaces around it", " blue goat river morning "],
    ["empty", ""],
  ])("refuses %s, in plain words", (_n, p) => {
    const msg = passphraseProblem(p);
    expect(msg).toBeTruthy();
    expect(msg).not.toMatch(/regex|entropy|invalid/i);
  });

  it("refuses a passphrase that contains the PIN", () => expect(passphraseProblem("goat river 4821 morning", "4821")).toMatch(/PIN/));
  it("the minimum is 10 characters", () => expect(MIN_PASSPHRASE).toBe(10));
  it("the real key stretching is at least 600,000 rounds", () => expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000));
});

describe("one counter of five tries for PIN and passphrase together", () => {
  beforeEach(() => localStorage.clear());
  it("two wrong PINs plus three wrong passphrases is five: signed out on the fifth", async () => {
    const u = "u-1";
    await setPin(u, "4821");
    expect(await checkPin(u, "0000")).toBe("wrong");
    expect(await checkPin(u, "0000")).toBe("wrong");
    expect(recordFailure(u)).toBe("wrong");
    expect(recordFailure(u)).toBe("wrong");
    expect(attemptsLeft(u)).toBe(MAX_ATTEMPTS - 4);
    expect(recordFailure(u)).toBe("signed-out");
  });
  it("a right answer resets the count", () => {
    recordFailure("u-2"); recordFailure("u-2");
    resetAttempts("u-2");
    expect(attemptsLeft("u-2")).toBe(MAX_ATTEMPTS);
  });
});
