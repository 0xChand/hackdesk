// Fetch a challenge page as readable text. Client-rendered pages often ship a
// near-empty HTML shell, so fall back to the page's Markdown twin or llms.txt.

import { extractLinks, htmlToText, type LinkHit } from "./extract.ts";

export interface Page {
  url: string;
  source: string;
  text: string;
  links: LinkHit[];
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<Page> {
  const get = async (u: string) => {
    const res = await fetch(u, {
      headers: { "user-agent": "hackdesk-eve-agent", accept: "text/html,text/markdown;q=0.9,*/*;q=0.8" },
      signal: signal ?? AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : "" };
  };

  const page = await get(url);
  if (!page.ok) throw new Error(`Fetch failed with HTTP ${page.status} for ${url}`);
  const isHtml = /<html|<body|<div/i.test(page.body);
  let text = isHtml ? htmlToText(page.body) : page.body;
  const links = isHtml ? extractLinks(page.body, url) : [];
  let source = url;

  if (text.length < 400) {
    const alts = [`${url.replace(/\/$/, "")}.md`, new URL("/llms.txt", url).toString()];
    for (const alt of alts) {
      const r = await get(alt).catch(() => null);
      if (r?.ok && r.body.length > text.length && !/<html/i.test(r.body)) {
        text = r.body;
        source = alt;
        break;
      }
    }
  }
  return { url, source, text, links };
}
