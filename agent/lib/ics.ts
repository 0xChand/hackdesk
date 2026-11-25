// iCalendar feed + Google Calendar links for tracked deadlines.

import type { Challenge } from "./store.ts";

function stamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text escaping + 75-octet line folding. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** Fold at 75 UTF-8 octets without splitting a character (continuation lines start with a space). */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function describe(c: Challenge): string {
  const open = c.checklist.filter((i) => !i.done);
  return [
    `Deadline: ${c.deadlineLabel}`,
    c.planAt && c.planAt !== c.deadlineAt ? `Plan for: ${c.planAt} (earliest reading)` : "",
    ...c.deadlineAssumptions,
    c.prizes ? `Prizes: ${c.prizes}` : "",
    open.length ? `Open items:\n${open.map((i) => `- ${i.text}${i.required ? "" : " (optional)"}`).join("\n")}` : "All checklist items done.",
    c.url,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function toIcs(challenges: Challenge[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hackdesk//eve agent//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:hackdesk deadlines",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];
  for (const c of challenges) {
    // Alarms fire relative to the conservative cutoff so you're never late on a technicality.
    const end = new Date(c.planAt ?? c.deadlineAt);
    const start = new Date(end.getTime() - 60 * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${c.id}@hackdesk`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `LAST-MODIFIED:${stamp(c.updatedAt)}`,
      `DTSTART:${stamp(start.toISOString())}`,
      `DTEND:${stamp(end.toISOString())}`,
      fold(`SUMMARY:${esc(`⏰ ${c.name} deadline`)}`),
      fold(`DESCRIPTION:${esc(describe(c))}`),
      fold(`URL:${c.url}`),
      ...[72, 24, 3].flatMap((h) => [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        fold(`DESCRIPTION:${esc(`${c.name} closes in ${h}h`)}`),
        `TRIGGER;RELATED=END:-PT${h}H`,
        "END:VALARM",
      ]),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function googleCalendarUrl(c: Challenge): string {
  const end = new Date(c.planAt ?? c.deadlineAt);
  const start = new Date(end.getTime() - 60 * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `⏰ ${c.name} deadline`,
    dates: `${stamp(start.toISOString())}/${stamp(end.toISOString())}`,
    details: describe(c),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
