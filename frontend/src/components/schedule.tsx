import { Chip } from "./buttons";

export type Day = { key: string; weekday: string; date: number };

/** 7.9: date strip. Selected day is a lavender circle with an ink number and underline. */
export function DateStrip({ days, selected, onSelect }: { days: Day[]; selected: string; onSelect?: (key: string) => void }) {
  return (
    <div className="datestrip" role="listbox" aria-label="Choose a day">
      {days.map((d) => (
        <button key={d.key} role="option" aria-selected={d.key === selected} className={`day${d.key === selected ? " is-selected" : ""}`} onClick={() => onSelect?.(d.key)}>
          <span className="caption">{d.weekday}</span>
          <span className="day-num tabular">{d.date}</span>
        </button>
      ))}
    </div>
  );
}

export type Slot = { time: string; unavailable?: boolean };

/** 7.9: 12-hour times ("8:00 am"). Stored in UTC, shown in the device's time zone. */
export function TimeSlots({ slots, selected, onSelect }: { slots: Slot[]; selected?: string; onSelect?: (time: string) => void }) {
  return (
    <div className="slots">
      {slots.map((s) => (
        <Chip key={s.time} className={`slot tabular${s.unavailable ? " is-unavailable" : ""}`} selected={s.time === selected} disabled={s.unavailable} onClick={() => onSelect?.(s.time)}>
          {s.time}
        </Chip>
      ))}
    </div>
  );
}
