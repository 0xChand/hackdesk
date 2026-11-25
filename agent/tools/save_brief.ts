import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveBrief } from "../lib/jobs.ts";

export default defineTool({
  description:
    "Save a deadline brief (markdown) you wrote for the user. Writes brief.md in the data dir, keeps the last 30 (the board shows the latest), and if HACKDESK_WEBHOOK_URL is set, POSTs it to Slack/Discord.",
  inputSchema: z.object({ markdown: z.string().min(1) }),
  label: { start: () => "Saving the brief" },
  async execute({ markdown }) {
    return saveBrief(markdown);
  },
});
