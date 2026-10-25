import { SESSION_LABEL, type SessionName, type SessionSnapshot } from "./types.js";

const NY = "America/New_York";

interface NyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

export function newYorkParts(now: Date): NyParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  let hour = Number(pick("hour"));
  if (hour === 24) hour = 0;

  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour,
    minute: Number(pick("minute")),
    second: Number(pick("second")),
    weekday: pick("weekday"),
  };
}

export function sessionName(parts: NyParts): SessionName {
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return "closed";
  const minuteOfDay = parts.hour * 60 + parts.minute;
  if (minuteOfDay >= 4 * 60 && minuteOfDay < 9 * 60 + 30) return "pre-market";
  if (minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60) return "regular";
  if (minuteOfDay >= 16 * 60 && minuteOfDay < 20 * 60) return "after-hours";
  return "closed";
}

export function getSession(now: Date): SessionSnapshot {
  const parts = newYorkParts(now);
  const name = sessionName(parts);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    name,
    label: SESSION_LABEL[name],
    asOf: now.toISOString(),
    timezone: NY,
    clock: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
  };
}
