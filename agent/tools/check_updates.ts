import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkUpdates } from "../lib/jobs.ts";

export default defineTool({
  description:
    "Re-fetch tracked challenge pages and diff them against the last snapshot. Reports added/removed lines and added/removed dates, so you can tell the user when an organizer extends a deadline, adds a rule, or changes prizes. Records each change on the challenge. If deadlineMayHaveMoved, re-read the page with read_challenge and call track_challenge with the new deadline.",
  inputSchema: z.object({ challengeId: z.string().optional().describe("Omit to check every open challenge.") }),
  label: { start: () => "Checking pages for rule changes" },
  async execute({ challengeId }, ctx) {
    return checkUpdates(challengeId, ctx.abortSignal);
  },
});
