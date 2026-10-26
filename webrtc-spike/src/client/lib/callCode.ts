/** Make "Clinic 1 " and "clinic1" the same code, so a typo in case or spacing can't keep two people apart. */
export function normaliseCode(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

/** A short random code to read out loud or text to the other person, e.g. "hc-4821". */
export function generateCode(random: (max: number) => number = randomBelow): string {
  return `hc-${String(random(10000)).padStart(4, "0")}`;
}

function randomBelow(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % max;
}
