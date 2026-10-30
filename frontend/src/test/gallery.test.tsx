import { render, screen, within } from "@testing-library/react";
import { Gallery } from "../gallery/Gallery";
import { BottomNav } from "../components/nav";
import { Field } from "../components/inputs";
import { PrimaryButton } from "../components/buttons";

const SECTIONS = ["brand", "colour", "type", "buttons", "chips", "cards", "schedule", "sync", "inputs", "voice", "photo", "vitals", "referral", "rx", "call", "emergency", "states", "overlays", "nav"];

describe("gallery", () => {
  it("shows every component section", () => {
    const { container } = render(<Gallery />);
    for (const id of SECTIONS) expect(container.querySelector(`#${id}`), id).not.toBeNull();
  });

  it("every icon-only button has an accessible name", () => {
    const { container } = render(<Gallery />);
    for (const b of container.querySelectorAll("button")) {
      const name = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
      expect(name, b.outerHTML.slice(0, 120)).not.toBe("");
    }
  });

  it("every input has a visible label (never placeholder-only)", () => {
    const { container } = render(<Gallery />);
    for (const i of container.querySelectorAll("input")) {
      const labelled = i.labels?.length || i.getAttribute("aria-label");
      expect(labelled, i.outerHTML.slice(0, 120)).toBeTruthy();
    }
  });

  it("shows all four sync statuses with text, not colour alone", () => {
    render(<Gallery />);
    for (const t of ["Saved on phone", "Sending…", "Sent", "Needs attention"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });

  it("renders the Twi/Ewe/Hausa test string", () => {
    render(<Gallery />);
    expect(screen.getByText(/Ɛyɛ, ɔhaw, ŋ, ɖ, ƒ, ɣ, ʋ, ʒ, ɓ, ɗ, ƙ, ƴ, ₵ 25.00/)).toBeTruthy();
  });

  it("has exactly one red filled Emergency button outside the sheet, and the end-call button", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelectorAll(".btn-emergency")).toHaveLength(1);
    expect(container.querySelectorAll(".call-end").length).toBe(2);
  });

  it("prescription shows a QR drawn on the device", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelectorAll(".qr svg").length).toBe(2);
  });
});

describe("component rules", () => {
  it("bottom nav shows labels and refuses more than five tabs", () => {
    const tabs = Array.from({ length: 6 }, (_, i) => ({ key: `t${i}`, label: `Tab ${i}`, icon: "house" as const }));
    expect(() => render(<BottomNav tabs={tabs} active="t0" />)).toThrow(/at most 5/);
    const { container } = render(<BottomNav tabs={tabs.slice(0, 5)} active="t1" />);
    expect(container.querySelectorAll(".navtab-label")).toHaveLength(5);
    expect(within(container).getByRole("button", { name: "Tab 1" }).getAttribute("aria-current")).toBe("page");
  });

  it("an error replaces the helper text and marks the field invalid", () => {
    render(<Field label="Village" helper="Helpful" error="Please add the village name" />);
    const input = screen.getByLabelText("Village");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Helpful")).toBeNull();
    expect(screen.getByText("Please add the village name")).toBeTruthy();
  });

  it("a loading primary button cannot be pressed twice", () => {
    const onClick = vi.fn();
    render(<PrimaryButton loading onClick={onClick}>Save</PrimaryButton>);
    const b = screen.getByRole("button");
    expect(b.hasAttribute("disabled")).toBe(true);
    b.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
