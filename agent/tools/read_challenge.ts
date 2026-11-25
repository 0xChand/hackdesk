import { defineTool, offloadContent } from "eve/tools";
import { z } from "zod";
import { resolveDeadline } from "../lib/deadline.ts";
import { findDates } from "../lib/extract.ts";
import { fetchPage } from "../lib/page.ts";

export default defineTool({
  description:
    "Fetch a hackathon / challenge web page. Returns its readable text, every date found with surrounding context, and for deadline-looking dates an exact resolved cutoff (time + timezone → UTC instant, with any assumptions flagged). Use this before track_challenge so deadlines and rules come from the page, never from memory.",
  inputSchema: z.object({
    url: z.string().url(),
    maxChars: z.number().int().min(2000).max(60000).default(24000),
  }),
  label: { start: () => "Reading the challenge page" },
  async execute({ url, maxChars }, ctx) {
    const page = await fetchPage(url, ctx.abortSignal);
    const dates = findDates(page.text, new Date().getUTCFullYear());
    const deadlineCandidates = dates
      .filter((d) => d.looksLikeDeadline && d.iso)
      .map((d) => ({ ...resolveDeadline(d.iso!, d.near), evidence: d.context }));
    // Dedupe identical instants (pages repeat the deadline in hero, FAQ and footer).
    const seen = new Set<string>();
    const key = (c: { at: string; conservativeAt: string }) => `${c.at}|${c.conservativeAt}`;
    const uniqueCandidates = deadlineCandidates.filter((c) => (seen.has(key(c)) ? false : (seen.add(key(c)), true)));

    return {
      source: page.source,
      fetchedAt: new Date().toISOString(),
      deadlineCandidates: uniqueCandidates,
      otherDates: dates.filter((d) => !d.looksLikeDeadline).map((d) => ({ iso: d.iso, context: d.context })),
      links: page.links
        .filter((l) => l.text && !/\.(png|jpe?g|svg|css|js)(\?|$)/i.test(l.href))
        .slice(0, 60),
      truncated: page.text.length > maxChars,
      text: page.text.slice(0, maxChars),
    };
  },
  toModelOutput: offloadContent({ maxBytes: 32000 }),
});
