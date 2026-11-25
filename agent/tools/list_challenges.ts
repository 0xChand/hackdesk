import { defineTool } from "eve/tools";
import { z } from "zod";
import { daysUntil, urgency } from "../lib/extract";
import { load } from "../lib/store";

export default defineTool({
  description:
    "List tracked challenges sorted by urgency, with days left, urgency band, progress and open checklist items. Call this before answering anything about deadlines or what to work on next.",
  inputSchema: z.object({ includeClosed: z.boolean().default(false) }),
  async execute({ includeClosed }) {
    const { challenges } = await load();
    const now = new Date();
    const rows = challenges
      .map((c) => {
        const days = daysUntil(c.deadline, now, c.deadlineUtcOffsetHours);
        const open = c.checklist.filter((i) => !i.done);
        return {
          id: c.id,
          name: c.name,
          url: c.url,
          deadline: c.deadline,
          deadlineNote: c.deadlineNote,
          daysLeft: days,
          urgency: urgency(days),
          progress: `${c.checklist.length - open.length}/${c.checklist.length}`,
          openRequired: open.filter((i) => i.required).map((i) => `${i.id}: ${i.text}`),
          openOptional: open.filter((i) => !i.required).map((i) => `${i.id}: ${i.text}`),
          repoUrl: c.repoUrl,
          judgingCriteria: c.judgingCriteria,
        };
      })
      .filter((r) => includeClosed || r.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft || b.openRequired.length - a.openRequired.length);
    return { today: now.toISOString().slice(0, 10), count: rows.length, challenges: rows };
  },
});
