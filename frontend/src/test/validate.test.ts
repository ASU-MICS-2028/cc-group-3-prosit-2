import { callCodeProblem, ghanaPhone, nameProblem, numberProblem, phoneProblem, placeProblem, toNumber, vitalProblem, yearProblem } from "../data/validate";

describe("names", () => {
  it.each(["Akosua Boateng", "Kwame Nkrumah-Mensah", "Ama O'Brien", "Ɛfua Ɖarko", "Adwoa Frimpong Jr.", "Yaw"])("accepts %s", (n) => expect(nameProblem(n)).toBeNull());
  it.each([
    ["", /enter the name/], ["   ", /enter the name/], ["A", /too short/], ["x".repeat(101), /too long/],
    ["Akosua2", /no numbers/], ["1234", /no numbers/], ["Ama@home", /letters, spaces/], ["<b>Ama</b>", /letters, spaces/], ["-Ama", /letters, spaces/],
  ])("refuses %j", (n, msg) => expect(nameProblem(n)).toMatch(msg as RegExp));
});

describe("village or town (optional)", () => {
  it.each(["", "Dodowa", "Amasaman 2", "Ga East, Accra", "Tamale-North"])("accepts %j", (v) => expect(placeProblem(v)).toBeNull());
  it.each(["##", "Dodowa!!", "x".repeat(101)])("refuses %j", (v) => expect(placeProblem(v)).not.toBeNull());
});

describe("year of birth (optional)", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  it.each(["", "1984", "1900", "2026"])("accepts %j", (v) => expect(yearProblem(v, now)).toBeNull());
  it.each([["abcd", /Numbers only/], ["19a4", /Numbers only/], ["84", /4-digit/], ["19844", /4-digit/], ["1899", /between 1900 and 2026/], ["2027", /between 1900 and 2026/], ["-198", /Numbers only/]])("refuses %j", (v, msg) => expect(yearProblem(v, now)).toMatch(msg as RegExp));
});

describe("Ghana phone number (optional)", () => {
  it.each([["", ""], ["244000001", "244000001"], ["0244000001", "244000001"], ["024 400 0001", "244000001"], ["024-400-0001", "244000001"]])("accepts %j", (v, digits) => expect(ghanaPhone(v)).toEqual({ digits, problem: null }));
  it.each([["abc", /Numbers only/], ["24400000a", /Numbers only/], ["+233244000001", /Numbers only/], ["2440", /9 digits/], ["24400000123", /9 digits/]])("refuses %j", (v, msg) => expect(phoneProblem(v)).toMatch(msg as RegExp));
});

describe("readings typed by hand", () => {
  it.each(["", "37", "37.4", "37,4", "0.5", "120"])("accepts %j", (v) => expect(numberProblem(v)).toBeNull());
  it.each(["abc", "37.4.1", "-5", "3 7", "1e3", "37.", ".5", "٣٧"])("refuses %j", (v) => expect(numberProblem(v)).toMatch(/Numbers only/));
  it("turns a comma into a decimal point, and empty into nothing", () => { expect(toNumber("37,4")).toBe(37.4); expect(toNumber(" ")).toBeUndefined(); });

  it("checks each reading against its plausible range, in words", () => {
    expect(vitalProblem("temperature", "36.8")).toBeNull();
    expect(vitalProblem("temperature", "368")).toMatch(/Body temperature of 368 °C looks wrong. It should be between 25 and 45/);
    expect(vitalProblem("weight", "0.1")).toMatch(/looks wrong/);
    expect(vitalProblem("height", "")).toBeNull();
    expect(vitalProblem("systolic", "abc")).toMatch(/Numbers only/);
  });
});

describe("call codes", () => {
  it.each(["", "hc-4821", "Clinic 1"])("accepts %j", (v) => expect(callCodeProblem(v)).toBeNull());
  it.each(["hc/4821", "a".repeat(65), "<script>"])("refuses %j", (v) => expect(callCodeProblem(v)).not.toBeNull());
});
