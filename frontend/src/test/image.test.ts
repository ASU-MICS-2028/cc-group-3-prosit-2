import { HARD_LIMIT_BYTES, TARGET_BYTES, fitToSize } from "../media/image";

/** A pretend camera encoder: bigger pictures and higher quality make bigger files. */
const encoder = (bytesAtFull: number, calls?: [number, number, number][]) => async (w: number, h: number, q: number) => {
  calls?.push([w, h, Math.round(q * 10) / 10]);
  return new Blob([new Uint8Array(Math.round(bytesAtFull * (w * h) / (1000 * 1000) * q))]);
};

describe("fitToSize", () => {
  it("keeps a small photo at high quality", async () => {
    const calls: [number, number, number][] = [];
    const r = await fitToSize(1000, 1000, encoder(100_000, calls));
    expect(r.blob.size).toBeLessThanOrEqual(TARGET_BYTES);
    expect(calls).toHaveLength(1);
    expect(r.width).toBe(1000);
  });

  it("lowers the quality before it shrinks the picture", async () => {
    const calls: [number, number, number][] = [];
    const r = await fitToSize(1000, 1000, encoder(160_000, calls));   // 128 KB at 0.8, 80 KB at 0.5
    expect(r.blob.size).toBeLessThanOrEqual(TARGET_BYTES);
    expect(r.width).toBe(1000);
    expect(calls.every(([w]) => w === 1000)).toBe(true);
    expect(calls.map((c) => c[2])).toEqual([...calls.map((c) => c[2])].sort((a, b) => b - a));
  });

  it("shrinks the picture when quality alone is not enough", async () => {
    const r = await fitToSize(1000, 1000, encoder(900_000));
    expect(r.blob.size).toBeLessThanOrEqual(TARGET_BYTES);
    expect(r.width).toBeLessThan(1000);
  });

  it("accepts a photo that misses the target but is under the hard limit, and refuses one that can't fit", async () => {
    const stubborn = async () => new Blob([new Uint8Array(200_000)]);
    expect((await fitToSize(500, 500, stubborn)).blob.size).toBe(200_000);
    const hopeless = async () => new Blob([new Uint8Array(HARD_LIMIT_BYTES + 1)]);
    await expect(fitToSize(500, 500, hopeless)).rejects.toThrow(/can't be made small enough/);
  });

  it("never asks for a picture smaller than 1 pixel", async () => {
    const calls: [number, number, number][] = [];
    await fitToSize(2, 2, encoder(10_000_000, calls)).catch(() => undefined);
    expect(calls.every(([w, h]) => w >= 1 && h >= 1)).toBe(true);
  });
});
