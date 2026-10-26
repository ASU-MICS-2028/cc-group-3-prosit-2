import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, parseSignal } from "./signaling";

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

  it("accepts an optional display name on offers and answers", () => {
    expect(parseSignal('{"type":"offer","sdp":{"type":"offer"},"name":"Ama"}')).not.toBeNull();
    expect(parseSignal('{"type":"answer","sdp":{"type":"answer"}}')).not.toBeNull();
  });
  it("rejects a name that is not a string or is too long", () => {
    expect(parseSignal('{"type":"offer","sdp":{"type":"offer"},"name":5}')).toBeNull();
    expect(parseSignal(`{"type":"answer","sdp":{"type":"answer"},"name":"${"x".repeat(MAX_NAME_LENGTH + 1)}"}`)).toBeNull();
    expect(parseSignal(`{"type":"answer","sdp":{"type":"answer"},"name":"${"x".repeat(MAX_NAME_LENGTH)}"}`)).not.toBeNull();
  });
});
