import { defineTool } from "eve/tools";
import { z } from "zod";
import { findChallenge, update } from "../lib/store.ts";
import { viewOf } from "../lib/view.ts";

export default defineTool({
  description:
    "Mark checklist items done/undone (optionally with a note such as the submitted URL), add an item the page didn't list, set the repo URL, or acknowledge detected page changes.",
  inputSchema: z.object({
    challengeId: z.string(),
    items: z.array(z.object({ id: z.string(), done: z.boolean(), note: z.string().optional() })).default([]),
    addItems: z.array(z.object({ text: z.string(), required: z.boolean().default(false) })).default([]),
    repoUrl: z.string().optional(),
    acknowledgeChanges: z.boolean().default(false),
  }),
  label: { start: () => "Updating the checklist" },
  async execute({ challengeId, items, addItems, repoUrl, acknowledgeChanges }) {
    return update((db) => {
      const c = findChallenge(db, challengeId);
      const unknown: string[] = [];
      for (const u of items) {
        const item = c.checklist.find((i) => i.id === u.id);
        if (!item) {
          unknown.push(u.id);
          continue;
        }
        item.done = u.done;
        if (u.note !== undefined) item.note = u.note;
      }
      for (const a of addItems) {
        c.checklist.push({ id: `c${c.checklist.length + 1}`, text: a.text, required: a.required, done: false });
      }
      if (repoUrl) c.repoUrl = repoUrl;
      if (acknowledgeChanges) for (const ch of c.changes) ch.acknowledged = true;
      c.updatedAt = new Date().toISOString();
      return { unknownItemIds: unknown, ...viewOf(c) };
    });
  },
});
