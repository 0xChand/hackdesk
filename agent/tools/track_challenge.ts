import { defineTool } from "eve/tools";
import { z } from "zod";
import { trackChallenge } from "../lib/jobs.ts";

export default defineTool({
  description:
    "Start tracking a challenge, or update one already tracked (matched by url or id). Record only facts read from the page via read_challenge. The checklist must have one item per concrete deliverable or submission step on the page; mark optional ones required=false. Progress on items with the same text is preserved. Also snapshots the page so check_updates can detect rule or deadline changes later.",
  inputSchema: z.object({
    name: z.string().min(2),
    url: z.string().url(),
    deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
    deadlineTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("24h local time as written on the page. Omit if the page gives none (23:59 is assumed)."),
    timezone: z.string().optional().describe('As written on the page: "AoE", "PT", "JST", "UTC+9", "11:59 PM ET"... Omit if none (UTC is assumed).'),
    deadlineWording: z
      .string()
      .optional()
      .describe('The exact sentence the page uses, e.g. "Submit before December 11, 2026". Used to catch "before" / no-timezone traps.'),
    prizes: z.string().optional(),
    judgingCriteria: z.array(z.string()).default([]),
    requiredKeywords: z
      .array(z.string())
      .default([])
      .describe("Tech the entry must visibly use, e.g. the sponsor framework's package name (\"eve\"). audit_repo checks these."),
    checklist: z.array(z.object({ text: z.string(), required: z.boolean().default(true) })).min(1),
    repoUrl: z.string().optional(),
  }),
  label: { start: () => "Tracking the challenge" },
  async execute(input, ctx) {
    return trackChallenge(input, ctx.abortSignal);
  },
});
