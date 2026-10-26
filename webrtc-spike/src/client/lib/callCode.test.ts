import { describe, expect, it } from "vitest";
import { generateCode, normaliseCode } from "./callCode";

describe("normaliseCode", () => {
  it("ignores case and surrounding spaces, and joins inner spaces", () => {
    expect(normaliseCode("  Clinic 1 ")).toBe("clinic-1");
    expect(normaliseCode("HC-4821")).toBe(normaliseCode("hc-4821"));
  });
  it("turns blank input into an empty code", () => {
    expect(normaliseCode("   ")).toBe("");
  });
});

describe("generateCode", () => {
  it("pads to four digits", () => {
    expect(generateCode(() => 7)).toBe("hc-0007");
  });
  it("is within range with the real random source", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^hc-\d{4}$/);
  });
});
