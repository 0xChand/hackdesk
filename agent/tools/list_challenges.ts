import { defineTool } from "eve/tools";
import { z } from "zod";
import { load } from "../lib/store.ts";
import { sortByUrgency, viewOf } from "../lib/view.ts";

export default defineTool({
  description:
    "List tracked challenges, most urgent first: exact time left, urgency band, progress, open required/optional checklist items, last audit score, unacknowledged page changes, and an add-to-Google-Calendar link. Call this before answering anything about deadlines or what to work on next.",
  inputSchema: z.object({ includeClosed: z.boolean().default(false) }),
  label: { start: () => "Checking deadlines" },
  async execute({ includeClosed }) {
    const { challenges } = await load();
    const now = new Date();
    const views = sortByUrgency(challenges.map((c) => viewOf(c, now))).filter((v) => includeClosed || v.hoursLeft >= 0);
    return { now: now.toISOString(), count: views.length, challenges: views };
  },
});
