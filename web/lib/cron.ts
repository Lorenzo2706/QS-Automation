// Maps the scheduling UI (start datetime + recurrence) to a 5-field cron pattern.
// The picked time is treated as wall-clock in the schedule's timezone
// (Europe/Amsterdam), so we read the literal hour/minute from the datetime-local
// string rather than going through Date timezone conversions.

export type Recurrence = "daily" | "weekdays" | "weekly";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// startLocal is a datetime-local value: "YYYY-MM-DDTHH:mm" (seconds optional).
function parseLocal(startLocal: string) {
  const m = startLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Invalid start datetime: ${startLocal}`);
  const [, year, month, day, hour, minute] = m;
  return {
    year: +year,
    month: +month,
    day: +day,
    hour: +hour,
    minute: +minute,
  };
}

export function buildCron(startLocal: string, recurrence: Recurrence): string {
  const { year, month, day, hour, minute } = parseLocal(startLocal);
  switch (recurrence) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly": {
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
      return `${minute} ${hour} * * ${dow}`;
    }
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Human-readable summary for the UI, e.g. "Weekly on Monday at 09:30".
export function describeSchedule(startLocal: string, recurrence: Recurrence): string {
  const { year, month, day, hour, minute } = parseLocal(startLocal);
  const time = `${pad2(hour)}:${pad2(minute)}`;
  switch (recurrence) {
    case "daily":
      return `Daily at ${time}`;
    case "weekdays":
      return `Every weekday at ${time}`;
    case "weekly": {
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return `Weekly on ${WEEKDAY_NAMES[dow]} at ${time}`;
    }
  }
}
