import { defineTool, offloadContent } from "eve/tools";
import { z } from "zod";
import { consolidate } from "../lib/deadline.ts";
import { findDates } from "../lib/extract.ts";
import { fetchPage } from "../lib/page.ts";

export default defineTool({
  description:
    "Fetch a hackathon / challenge web page. Returns its readable text, deadline candidates resolved to exact cutoffs (time + timezone → UTC instant; repeated mentions merged, the most precise wording wins; assumptions and risky wording flagged in notes, with a conservative planning time), the other dates on the page, and its links. Use this before track_challenge so deadlines and rules come from the page, never from memory.",
  inputSchema: z.object({
    url: z.string().url(),
    maxChars: z.number().int().min(2000).max(60000).default(24000),
  }),
  label: { start: () => "Reading the challenge page" },
  async execute({ url, maxChars }, ctx) {
    const page = await fetchPage(url, ctx.abortSignal);
    const dates = findDates(page.text, new Date().getUTCFullYear());
    const deadlineCandidates = consolidate(
      dates.filter((d) => d.looksLikeDeadline && d.iso).map((d) => ({ iso: d.iso!, near: d.near, context: d.context })),
    );

    // Other dates (kickoff, winners, voting…) once each, with the first context they appear in.
    const other = new Map<string, { iso: string; mentions: number; context: string }>();
    for (const d of dates) {
      if (d.looksLikeDeadline || !d.iso) continue;
      const o = other.get(d.iso);
      if (o) o.mentions++;
      else other.set(d.iso, { iso: d.iso, mentions: 1, context: d.context });
    }

    return {
      source: page.source,
      fetchedAt: new Date().toISOString(),
      deadlineCandidates,
      otherDates: [...other.values()].sort((a, b) => a.iso.localeCompare(b.iso)),
      links: page.links.filter((l) => l.text && !/\.(png|jpe?g|svg|css|js)(\?|$)/i.test(l.href)).slice(0, 60),
      truncated: page.text.length > maxChars,
      text: page.text.slice(0, maxChars),
    };
  },
  toModelOutput: offloadContent({ maxBytes: 32000 }),
});
