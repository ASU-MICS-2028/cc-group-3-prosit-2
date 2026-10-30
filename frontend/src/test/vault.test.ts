import { VaultLockedError, createVault, hasVault, isUnlocked, lockVault, open, seal, unlockVault, wipeVault } from "../data/vault";

const uid = () => crypto.randomUUID();
beforeEach(() => localStorage.clear());

describe("vault", () => {
  it("seals and opens a value; the sealed text does not contain the original", async () => {
    const u = uid(); await createVault(u, "4821");
    const s = await seal(u, { name: "Akosua Boateng" }, "rec-1");
    expect(JSON.stringify(s)).not.toContain("Akosua");
    expect(await open(u, s, "rec-1")).toEqual({ name: "Akosua Boateng" });
  });

  it("is unreadable once locked, and the right PIN opens it again", async () => {
    const u = uid(); await createVault(u, "4821");
    const s = await seal(u, { a: 1 }, "r");
    lockVault(u);
    expect(isUnlocked(u)).toBe(false);
    await expect(open(u, s, "r")).rejects.toBeInstanceOf(VaultLockedError);
    await expect(seal(u, {}, "r")).rejects.toBeInstanceOf(VaultLockedError);
    expect(await unlockVault(u, "4821")).toBe(true);
    expect(await open(u, s, "r")).toEqual({ a: 1 });
  });

  it("a wrong PIN does not open it", async () => {
    const u = uid(); await createVault(u, "4821"); lockVault(u);
    expect(await unlockVault(u, "0000")).toBe(false);
    expect(isUnlocked(u)).toBe(false);
  });

  it("unlocking with no vault is false, not a crash; a damaged vault is false too", async () => {
    const u = uid();
    expect(await unlockVault(u, "4821")).toBe(false);
    localStorage.setItem(`hc.vault.v1.${u}`, "{broken");
    expect(await unlockVault(u, "4821")).toBe(false);
  });

  it("a sealed value moved to another record fails to open", async () => {
    const u = uid(); await createVault(u, "4821");
    const s = await seal(u, { a: 1 }, "record-A");
    await expect(open(u, s, "record-B")).rejects.toThrow();
  });

  it("tampered ciphertext fails to open", async () => {
    const u = uid(); await createVault(u, "4821");
    const s = await seal(u, { a: 1 }, "r");
    const bytes = atob(s.ct).split(""); bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    await expect(open(u, { ...s, ct: btoa(bytes.join("")) }, "r")).rejects.toThrow();
  });

  it("one person's vault cannot open another person's data", async () => {
    const a = uid(), b = uid(); await createVault(a, "4821"); await createVault(b, "4821");
    const s = await seal(a, { secret: true }, "r");
    await expect(open(b, s, "r")).rejects.toThrow();
  });

  it("the same value sealed twice looks different (fresh nonce each time)", async () => {
    const u = uid(); await createVault(u, "4821");
    expect((await seal(u, { a: 1 }, "r")).ct).not.toBe((await seal(u, { a: 1 }, "r")).ct);
  });

  it("wiping removes the key for good", async () => {
    const u = uid(); await createVault(u, "4821");
    wipeVault(u);
    expect(hasVault(u)).toBe(false);
    expect(await unlockVault(u, "4821")).toBe(false);
  });
});

describe("large values", () => {
  it("seals and opens a photo-sized value (about 1 MB) without overflowing the call stack", async () => {
    const u = uid(); await createVault(u, "4821");
    const big = { data: "x".repeat(1_000_000) };
    const s = await seal(u, big, "r");
    expect(await open<typeof big>(u, s, "r")).toEqual(big);
  });
});
