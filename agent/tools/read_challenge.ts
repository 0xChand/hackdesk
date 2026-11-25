import { defineTool, offloadContent } from "eve/tools";
import { z } from "zod";
import { extractLinks, findDates, htmlToText } from "../lib/extract";

export default defineTool({
  description:
    "Fetch a hackathon / challenge web page and return its readable text, every date found (with surrounding context and a deadline hint), and its links. Use this before track_challenge so the deadline and rules come from the page, not memory. Falls back to the page's .md twin or the site's /llms.txt when the page is a client-rendered shell.",
  inputSchema: z.object({
    url: z.string().url(),
    maxChars: z.number().int().min(2000).max(60000).default(20000),
  }),
  async execute({ url, maxChars }, ctx) {
    const get = async (u: string) => {
      const res = await fetch(u, {
        headers: { "user-agent": "hackdesk-eve-agent", accept: "text/html,text/markdown,*/*" },
        signal: ctx.abortSignal,
        redirect: "follow",
      });
      return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : "" };
    };

    const page = await get(url);
    if (!page.ok) throw new Error(`Fetch failed with HTTP ${page.status} for ${url}`);
    let text = /<html|<body|<div/i.test(page.body) ? htmlToText(page.body) : page.body;
    const links = extractLinks(page.body, url);
    let source = url;

    // Many modern pages are client-rendered; fall back to a markdown twin.
    if (text.length < 400) {
      for (const alt of [`${url.replace(/\/$/, "")}.md`, new URL("/llms.txt", url).toString()]) {
        const r = await get(alt).catch(() => null);
        if (r?.ok && r.body.length > text.length) {
          text = r.body;
          source = alt;
          break;
        }
      }
    }

    const dates = findDates(text, new Date().getUTCFullYear());
    return {
      source,
      fetchedAt: new Date().toISOString(),
      dates,
      likelyDeadlines: dates.filter((d) => d.looksLikeDeadline && d.iso).map((d) => d.iso),
      links: links.slice(0, 60),
      truncated: text.length > maxChars,
      text: text.slice(0, maxChars),
    };
  },
  toModelOutput: offloadContent({ maxBytes: 30000 }),
});
