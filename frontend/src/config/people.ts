/** Who can be booked, and when. These are settings, not code: a real deployment reads them from the
 *  directory service (SVC-14). Names are made up (decision D-004). */
export type Specialist = { id: string; name: string; title: string; timeZone: string };

export const SPECIALISTS: Specialist[] = [
  { id: "00000000-0000-4000-8000-000000000003", name: "Dr. Kofi Mensah", title: "General practitioner", timeZone: "Africa/Accra" },
];

/** PLACEHOLDER, not a real line. The app labels it wherever it shows it. Replace when a real number is agreed. */
export const EMERGENCY_NUMBER = "0000000000";

/** Slots are fixed in UTC (Ghana is UTC+0) and shown in the device's own time zone, so a specialist in another
 *  country sees the right local time (brief p.3, time zones). */
export const AVAILABILITY = { startHourUtc: 8, endHourUtc: 16, slotMinutes: 30, daysAhead: 7, closedWeekdaysUtc: [0] };

/** The bookable start times (UTC, ISO) for the day that starts at `dayUtc` 00:00. */
export function slotsForDay(dayUtc: Date): string[] {
  if (AVAILABILITY.closedWeekdaysUtc.includes(dayUtc.getUTCDay())) return [];
  const out: string[] = [];
  for (let m = AVAILABILITY.startHourUtc * 60; m < AVAILABILITY.endHourUtc * 60; m += AVAILABILITY.slotMinutes) {
    out.push(new Date(dayUtc.getTime() + m * 60_000).toISOString());
  }
  return out;
}

/** Midnight UTC of the day `offset` days from `from`. */
export const dayStartUtc = (from: Date, offset: number) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + offset));
