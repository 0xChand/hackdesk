import { defineTool } from "eve/tools";
import { z } from "zod";
import { getChallenge, save } from "../lib/store";

export default defineTool({
  description:
    "Mark checklist items done or undone for a tracked challenge, optionally attach a note (such as the submitted URL), or set the challenge's repo URL.",
  inputSchema: z.object({
    challengeId: z.string(),
    items: z.array(z.object({ id: z.string(), done: z.boolean(), note: z.string().optional() })).default([]),
    repoUrl: z.string().optional(),
  }),
  async execute({ challengeId, items, repoUrl }) {
    const { db, challenge } = await getChallenge(challengeId);
    const unknown: string[] = [];
    for (const u of items) {
      const item = challenge.checklist.find((i) => i.id === u.id);
      if (!item) {
        unknown.push(u.id);
        continue;
      }
      item.done = u.done;
      if (u.note !== undefined) item.note = u.note;
    }
    if (repoUrl) challenge.repoUrl = repoUrl;
    challenge.updatedAt = new Date().toISOString();
    await save(db);
    const remaining = challenge.checklist.filter((i) => !i.done && i.required).length;
    return { challengeId, unknownItemIds: unknown, requiredRemaining: remaining, repoUrl: challenge.repoUrl };
  },
});
