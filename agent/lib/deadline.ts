// Resolve "December 11, 2026 at 11:59 PM PT" into an exact UTC instant.
// Pure and deterministic: the model picks which date is the deadline, this
// module makes sure the arithmetic around it is right (AoE, DST, 12h clocks).

export interface DeadlineGuess {
  date: string; // YYYY-MM-DD as written on the page
  time: string; // HH:MM 24h, local to tz
  tz: string; // label as found, or "UTC (assumed)"
  offsetHours: number;
  at: string; // ISO UTC instant
  assumedTime: boolean;
  assumedTz: boolean;
  /** Wording that changes the cutoff, e.g. "before Dec 11" may mean Dec 10 is the last day. */
  notes: string[];
  /** The earliest reasonable reading of the deadline. Plan against this one. */
  conservativeAt: string;
}

/** US DST: second Sunday of March 02:00 to first Sunday of November 02:00 (local). */
function usDst(y: number, m: number, d: number): boolean {
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  if (m < 3 || m > 11) return false;
  if (m > 3 && m < 11) return true;
  return m === 3 ? d >= nthSunday(3, 2) : d < nthSunday(11, 1);
}

/** EU DST: last Sunday of March to last Sunday of October. */
function euDst(y: number, m: number, d: number): boolean {
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(y, month, 0)); // last day of month
    return last.getUTCDate() - last.getUTCDay();
  };
  if (m < 3 || m > 10) return false;
  if (m > 3 && m < 10) return true;
  return m === 3 ? d >= lastSunday(3) : d < lastSunday(10);
}

type Zone = number | ((y: number, m: number, d: number) => number);
const us = (std: number): Zone => (y, m, d) => (usDst(y, m, d) ? std + 1 : std);
const eu = (std: number): Zone => (y, m, d) => (euDst(y, m, d) ? std + 1 : std);

// Longest names first so "PST" wins over "PT" and "Anywhere on Earth" over "AoE".
const ZONES: [RegExp, string, Zone][] = [
  [/\b(anywhere on earth|aoe)\b/i, "AoE", -12],
  [/\b(utc|gmt|zulu)\b|(?<=\d)z\b/i, "UTC", 0],
  [/\bpst\b/i, "PST", -8],
  [/\bpdt\b/i, "PDT", -7],
  [/\b(pt|pacific( time)?)\b/i, "PT", us(-8)],
  [/\best\b/i, "EST", -5],
  [/\bedt\b/i, "EDT", -4],
  [/\b(et|eastern( time)?)\b/i, "ET", us(-5)],
  [/\bcst\b/i, "CST", -6],
  [/\bcdt\b/i, "CDT", -5],
  [/\b(ct|central time)\b/i, "CT", us(-6)],
  [/\bmst\b/i, "MST", -7],
  [/\bmdt\b/i, "MDT", -6],
  [/\b(mt|mountain time)\b/i, "MT", us(-7)],
  [/\bjst\b|\bjapan( standard)? time\b/i, "JST", 9],
  [/\bkst\b/i, "KST", 9],
  [/\bist\b|\bindia( standard)? time\b/i, "IST", 5.5],
  [/\bsgt\b|\bsingapore time\b/i, "SGT", 8],
  [/\bhkt\b/i, "HKT", 8],
  [/\baedt\b/i, "AEDT", 11],
  [/\baest\b/i, "AEST", 10],
  [/\bcest\b/i, "CEST", 2],
  [/\bcet\b/i, "CET", eu(1)],
  [/\bbst\b/i, "BST", 1],
  [/\b(uk time|london time)\b/i, "UK", eu(0)],
  [/\bbrt\b/i, "BRT", -3],
];

const UTC_OFFSET = /\b(?:utc|gmt)\s*([+-−])\s*(\d{1,2})(?::?(\d{2}))?\b/i;

export function findZone(text: string, date: string): { tz: string; offsetHours: number } | null {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const explicit = text.match(UTC_OFFSET);
  if (explicit) {
    const sign = explicit[1] === "+" ? 1 : -1;
    const hours = Number(explicit[2]) + (explicit[3] ? Number(explicit[3]) / 60 : 0);
    return { tz: explicit[0].toUpperCase().replace(/\s+/g, ""), offsetHours: sign * hours };
  }
  let best: { index: number; tz: string; offsetHours: number } | null = null;
  for (const [re, label, zone] of ZONES) {
    const m2 = re.exec(text);
    if (m2 && (best === null || m2.index < best.index)) {
      best = { index: m2.index, tz: label, offsetHours: typeof zone === "number" ? zone : zone(y, m, d) };
    }
  }
  return best && { tz: best.tz, offsetHours: best.offsetHours };
}

export function findTime(text: string): string | null {
  if (/\bmidnight\b/i.test(text)) return "23:59";
  if (/\bnoon\b|\bmidday\b/i.test(text)) return "12:00";
  const twelve = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?\s?m\.?\b/i);
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twelve && (!twentyFour || (twelve.index ?? 0) <= (twentyFour.index ?? 0))) {
    let h = Number(twelve[1]) % 12;
    if (twelve[3]!.toLowerCase() === "p") h += 12;
    return `${String(h).padStart(2, "0")}:${twelve[2] ?? "00"}`;
  }
  if (twentyFour) return `${twentyFour[1]!.padStart(2, "0")}:${twentyFour[2]}`;
  return null;
}

/** Local wall time + offset -> UTC instant. */
export function toInstant(date: string, time: string, offsetHours: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const ms = Date.UTC(y, m - 1, d, hh, mm, hh === 23 && mm === 59 ? 59 : 0) - offsetHours * 3_600_000;
  return new Date(ms).toISOString();
}

/**
 * Given a date and the text around it, find the time and timezone the page
 * attaches to it. Defaults to end of day UTC and says so.
 */
export function resolveDeadline(date: string, nearbyText: string): DeadlineGuess {
  const time = findTime(nearbyText);
  const zone = findZone(nearbyText, date);
  const t = time ?? "23:59";
  const z = zone ?? { tz: "UTC (assumed)", offsetHours: 0 };
  const at = toInstant(date, t, z.offsetHours);
  const notes: string[] = [];
  let conservative = at;

  // "Submit before December 11" without a time: strictly, Dec 11 itself is too late.
  const datePos = nearbyText.search(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d|\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b20\d{2}-\d{2}-\d{2}/i);
  const lead = datePos > 0 ? nearbyText.slice(0, datePos) : "";
  if (/\b(before|prior to)\s*(the\s+)?$/i.test(lead) && time === null) {
    conservative = toInstant(date, "00:00", z.offsetHours);
    notes.push(`"before ${date}" can mean the cutoff is the start of that day.`);
  }
  // With no timezone, the earliest place on Earth to hit the time is UTC+14.
  if (zone === null) {
    const earliest = toInstant(date, conservative === at ? t : "00:00", 14);
    if (earliest < conservative) conservative = earliest;
    notes.push("No timezone on the page: the worst case is UTC+14.");
  }
  if (time === null) notes.push("No time on the page: assumed 23:59.");
  if (conservative !== at) notes.push(`Plan for ${conservative.slice(0, 16).replace("T", " ")} UTC to be safe.`);
  return {
    date,
    time: t,
    tz: z.tz,
    offsetHours: z.offsetHours,
    at,
    assumedTime: time === null,
    assumedTz: zone === null,
    notes,
    conservativeAt: conservative,
  };
}

/** "3d 4h", "5h 12m", "overdue by 2h". */
export function humanizeLeft(at: string, now: Date): string {
  let ms = new Date(at).getTime() - now.getTime();
  const over = ms < 0;
  ms = Math.abs(ms);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return over ? `overdue by ${s}` : s;
}

export function hoursLeft(at: string, now: Date): number {
  return (new Date(at).getTime() - now.getTime()) / 3_600_000;
}

export function urgencyOf(hours: number): "overdue" | "critical" | "soon" | "comfortable" {
  if (hours < 0) return "overdue";
  if (hours <= 48) return "critical";
  if (hours <= 168) return "soon";
  return "comfortable";
}
