import { defineTool } from "eve/tools";
import { z } from "zod";
import { xLength } from "../lib/extract.ts";

export default defineTool({
  description:
    "Check a drafted X (Twitter) announcement and turn it into a ready-to-open compose link. Counts length the way X does (every URL = 23 chars, 280 max), and verifies every phrase the challenge requires (mentions, hashtags, 'Builder Challenge', the repo link) is present. Never posts: the user opens the link and posts it themselves.",
  inputSchema: z.object({
    text: z.string().min(1),
    mustInclude: z.array(z.string()).default([]).describe('Phrases the challenge requires, e.g. ["@eve", "Builder Challenge"].'),
  }),
  label: { start: () => "Checking the post" },
  async execute({ text, mustInclude }) {
    const length = xLength(text);
    const missing = mustInclude.filter((m) => !text.toLowerCase().includes(m.toLowerCase()));
    return {
      length,
      fits: length <= 280,
      overBy: Math.max(0, length - 280),
      missing,
      ready: length <= 280 && missing.length === 0,
      intentUrl: `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    };
  },
});
