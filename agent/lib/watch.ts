// Snapshot a challenge page and diff it later. Organizers move deadlines and
// add rules mid-hackathon; this is how hackdesk notices.

import { findDates } from "./extract.ts";

export interface Snapshot {
  at: string;
  hash: string;
  lines: string[]; // normalized, meaningful lines (capped)
  dates: string[]; // ISO dates found, in order, deduped
}

export interface PageDiff {
  changed: boolean;
  added: string[];
  removed: string[];
  datesAdded: string[];
  datesRemoved: string[];
}

const MAX_LINES = 600;

/** FNV-1a 32-bit; enough to detect change, no crypto import needed. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Drop noise that changes on every load: countdowns, "x minutes ago", view counts, nonces. */
export function normalizeLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\d+\s*(d|h|m|s|days?|hours?|minutes?|mins?|seconds?|secs?)\b(\s*:?\s*)/gi, "")
      .replace(/\b\d+\s*(views?|participants?|registered|signups?|submissions so far)\b/gi, "#$1")
      .replace(/\b[0-9a-f]{16,}\b/gi, "");
    if (line.length < 4 || /^(ago|left|remaining)$/i.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

export function snapshot(text: string, now = new Date()): Snapshot {
  const lines = normalizeLines(text);
  const dates = [...new Set(findDates(text, now.getUTCFullYear()).map((d) => d.iso).filter((x): x is string => !!x))];
  return { at: now.toISOString(), hash: hash(lines.join("\n")), lines, dates };
}

export function diff(prev: Snapshot, next: Snapshot): PageDiff {
  if (prev.hash === next.hash) {
    return { changed: false, added: [], removed: [], datesAdded: [], datesRemoved: [] };
  }
  const a = new Set(prev.lines);
  const b = new Set(next.lines);
  const da = new Set(prev.dates);
  const db = new Set(next.dates);
  return {
    changed: true,
    added: next.lines.filter((l) => !a.has(l)).slice(0, 40),
    removed: prev.lines.filter((l) => !b.has(l)).slice(0, 40),
    datesAdded: next.dates.filter((d) => !da.has(d)),
    datesRemoved: prev.dates.filter((d) => !db.has(d)),
  };
}
