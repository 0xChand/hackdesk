// Pure, dependency-free helpers for turning a challenge page into evidence the
// model can reason over. Kept deterministic so they are unit-testable.

export interface DateHit {
  /** The literal text that matched, e.g. "December 11, 2026". */
  raw: string;
  /** ISO date (YYYY-MM-DD) when the match could be normalized. */
  iso: string | null;
  /** ~160 chars of surrounding text so the model can tell a deadline from a launch date. */
  context: string;
  /** True when the surrounding text uses deadline-ish language. */
  looksLikeDeadline: boolean;
  /** Text right around the date (same sentence), where a time and timezone would be written. */
  near: string;
}

export interface LinkHit {
  text: string;
  href: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const DEADLINE_WORDS =
  /\b(deadline|due|closes?|closing|ends?|submissions?|submit|until|last day|cutoff|cut-off|no later than)\b/i;

const ENTITY: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITY[e.toLowerCase()] ?? m)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n\s*/g, "\n")
    .trim();
}

export function extractLinks(html: string, baseUrl: string): LinkHit[] {
  const out: LinkHit[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    let href: string;
    try {
      href = new URL(m[1]!, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(href) || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, text: htmlToText(m[2]!).slice(0, 80) });
  }
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. Feb 31
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Up to 60 chars before `index`, cut at the previous sentence boundary. */
function lead(text: string, index: number): string {
  const before = text.slice(Math.max(0, index - 60), index);
  const cut = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"));
  return cut >= 0 ? before.slice(cut + 1) : before;
}

/** Up to 60 chars after `index`, cut at the next sentence boundary or the next date-like token. */
function trail(text: string, index: number): string {
  let after = text.slice(index, index + 60);
  const stop = after.search(/(?<!\b[ap]\.?m)\.\s|\n|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i);
  if (stop >= 0) after = after.slice(0, stop);
  return after;
}

/**
 * Find dates in free text. Handles "December 11, 2026", "Dec 11 2026",
 * "11 December 2026", and ISO "2026-12-11". Returns them in document order.
 */
export function findDates(text: string, defaultYear?: number): DateHit[] {
  const hits: { index: number; raw: string; iso: string | null }[] = [];
  const mon = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

  const patterns: { re: RegExp; parse: (m: RegExpMatchArray) => string | null }[] = [
    {
      // Month D(st|nd|rd|th)?, YYYY  (year optional)
      re: new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"),
      parse: (m) => {
        const y = m[3] ? Number(m[3]) : defaultYear;
        return y ? toIso(y, MONTHS[m[1]!.slice(0, 3).toLowerCase()]!, Number(m[2])) : null;
      },
    },
    {
      // D Month YYYY
      re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}\\.?,?\\s+(\\d{4})\\b`, "gi"),
      parse: (m) => toIso(Number(m[3]), MONTHS[m[2]!.slice(0, 3).toLowerCase()]!, Number(m[1])),
    },
    {
      re: /\b(20\d{2})-(\d{2})-(\d{2})\b/g,
      parse: (m) => toIso(Number(m[1]), Number(m[2]), Number(m[3])),
    },
  ];

  for (const { re, parse } of patterns) {
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      // Skip a match that sits inside one we already have (e.g. "11 December 2026" vs "December 2026").
      if (hits.some((h) => index >= h.index && index < h.index + h.raw.length)) continue;
      hits.push({ index, raw: m[0], iso: parse(m) });
    }
  }

  return hits
    .sort((a, b) => a.index - b.index)
    .map((h) => {
      const start = Math.max(0, h.index - 100);
      const context = text.slice(start, h.index + h.raw.length + 60).replace(/\s+/g, " ").trim();
      return {
        raw: h.raw,
        iso: h.iso,
        context,
        looksLikeDeadline: DEADLINE_WORDS.test(lead(text, h.index)),
        near: `${lead(text, h.index).slice(-30)}${h.raw}${trail(text, h.index + h.raw.length)}`,
      };
    });
}

/** Post length as X counts it: every URL is 23 characters. */
export function xLength(s: string): number {
  return s.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}
