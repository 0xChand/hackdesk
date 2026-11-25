import { defineTool } from "eve/tools";
import { z } from "zod";
import { xLength } from "../lib/extract";

export default defineTool({
  description:
    "Turn a drafted announcement into a ready-to-open X (Twitter) compose link, checking X's 280-character limit (every URL counts as 23). Never posts anything: the user opens the link and posts it themselves.",
  inputSchema: z.object({
    text: z.string().min(1).describe("Full post text including @mentions, hashtags and links."),
  }),
  async execute({ text }) {
    const length = xLength(text);
    return {
      length,
      fits: length <= 280,
      overBy: Math.max(0, length - 280),
      intentUrl: `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    };
  },
});
