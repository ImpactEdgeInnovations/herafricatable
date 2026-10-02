type WallTime = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

function wallTime(instant: Date, timeZone: string): WallTime {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
  return {
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    month: parts.month,
    year: parts.year,
  };
}

function wallMilliseconds(parts: WallTime) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function formatEventTimeInput(iso: string, timeZone: string) {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid event time");
  const parts = wallTime(instant, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function parseEventTimeInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid event time");
  const requested: WallTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const desired = wallMilliseconds(requested);
  const canonical = new Date(desired);
  if (!Number.isFinite(desired) || canonical.getUTCFullYear() !== requested.year
    || canonical.getUTCMonth() + 1 !== requested.month
    || canonical.getUTCDate() !== requested.day
    || canonical.getUTCHours() !== requested.hour
    || canonical.getUTCMinutes() !== requested.minute) {
    throw new Error("Invalid event time");
  }

  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = wallMilliseconds(wallTime(new Date(candidate), timeZone));
    const difference = desired - observed;
    if (difference === 0) return new Date(candidate).toISOString();
    candidate += difference;
  }
  throw new Error("This local event time does not exist in the selected timezone");
}
