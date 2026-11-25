import { defineTool } from "eve/tools";
import { z } from "zod";
import { load, save, slugify, type Challenge } from "../lib/store";

export default defineTool({
  description:
    "Start tracking a challenge, or update one already tracked (matched by url or id). Record only facts read from the challenge page. Build the checklist from the page's actual submission requirements; mark optional items required=false. Existing done/notes are preserved for items with the same text.",
  inputSchema: z.object({
    name: z.string().min(2),
    url: z.string().url(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
    deadlineUtcOffsetHours: z
      .number()
      .min(-12)
      .max(14)
      .default(0)
      .describe("UTC offset of the deadline's timezone. AoE = -12, JST = 9, PT = -8 (winter)."),
    deadlineNote: z.string().optional(),
    prizes: z.string().optional(),
    judgingCriteria: z.array(z.string()).default([]),
    checklist: z
      .array(z.object({ text: z.string(), required: z.boolean().default(true) }))
      .min(1)
      .describe("Every deliverable / submission step from the page."),
    repoUrl: z.string().optional(),
  }),
  async execute(input) {
    const db = await load();
    const now = new Date().toISOString();
    const existing = db.challenges.find((c) => c.url === input.url || c.id === slugify(input.name));
    const prev = new Map(existing?.checklist.map((i) => [i.text.toLowerCase(), i]) ?? []);

    const challenge: Challenge = {
      id: existing?.id ?? slugify(input.name),
      name: input.name,
      url: input.url,
      deadline: input.deadline,
      deadlineUtcOffsetHours: input.deadlineUtcOffsetHours,
      deadlineNote: input.deadlineNote,
      prizes: input.prizes,
      judgingCriteria: input.judgingCriteria,
      repoUrl: input.repoUrl ?? existing?.repoUrl,
      checklist: input.checklist.map((item, i) => {
        const p = prev.get(item.text.toLowerCase());
        return { id: `c${i + 1}`, text: item.text, required: item.required, done: p?.done ?? false, note: p?.note };
      }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    db.challenges = [...db.challenges.filter((c) => c.id !== challenge.id), challenge];
    await save(db);
    return { tracked: challenge.id, updated: Boolean(existing), checklistItems: challenge.checklist.length };
  },
});
