import { describe, expect, it } from "vitest";
import { parseSignal } from "./signaling";

describe("parseSignal", () => {
  it("accepts known messages", () => {
    expect(parseSignal('{"type":"join","room":"a"}')).toEqual({ type: "join", room: "a" });
    expect(parseSignal('{"type":"peer-left"}')).toEqual({ type: "peer-left" });
  });
  it("rejects junk, unknown types and bad rooms", () => {
    expect(parseSignal("not json")).toBeNull();
    expect(parseSignal("null")).toBeNull();
    expect(parseSignal('{"type":"hack"}')).toBeNull();
    expect(parseSignal('{"type":"join"}')).toBeNull();
    expect(parseSignal('{"type":"join","room":""}')).toBeNull();
    expect(parseSignal(`{"type":"join","room":"${"x".repeat(65)}"}`)).toBeNull();
  });
});
