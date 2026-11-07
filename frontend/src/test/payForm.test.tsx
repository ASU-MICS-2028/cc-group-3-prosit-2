import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/Session", () => {
  const session = { token: "t", mode: "test", user: { id: "p1", name: "A", role: "patient" } }; // one object, as the real provider keeps
  return { useSession: () => ({ session }) };
});
import { useState } from "react";
import { PayForm } from "../screens/payments";

/** A parent that re-renders each time it hears the result, with a new callback each time, as a real screen does. */
function Parent({ renders }: { renders: { n: number } }) {
  const [, setDone] = useState(0);
  renders.n++;
  return <PayForm purpose="consultation_fee" subjectId="v1" amount={25} onDone={() => setDone((n) => n + 1)} />;
}

describe("the payment form", () => {
  it("tells its parent once about a failure, with no render loop", async () => {
    localStorage.clear();
    const renders = { n: 0 };
    render(<Parent renders={renders} />);
    fireEvent.click(screen.getByRole("button", { name: "MTN" }));
    fireEvent.change(screen.getByLabelText("Mobile money number"), { target: { value: "240000000" } });
    fireEvent.click(screen.getByRole("button", { name: /^Pay / }));
    await screen.findByRole("alert");
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(renders.n).toBeLessThan(15);
  });
  it("refuses a number that is too short", () => {
    render(<Parent renders={{ n: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: "MTN" }));
    fireEvent.change(screen.getByLabelText("Mobile money number"), { target: { value: "12" } });
    expect((screen.getByRole("button", { name: /^Pay / }) as HTMLButtonElement).disabled).toBe(true);
  });
});
