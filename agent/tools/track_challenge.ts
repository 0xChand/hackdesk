import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveDeadline } from "../lib/deadline.ts";
import { fetchPage } from "../lib/page.ts";
import { slugify, update, type Challenge } from "../lib/store.ts";
import { viewOf } from "../lib/view.ts";
import { snapshot } from "../lib/watch.ts";

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
    // Same resolver read_challenge uses, fed the page's own words plus explicit fields.
    const wording = input.deadlineWording ?? `Deadline ${input.deadlineDate}`;
    const r = resolveDeadline(input.deadlineDate, `${wording} ${input.deadlineTime ?? ""} ${input.timezone ?? ""}`);
    const assumptions = [...r.notes];
    if (input.timezone && r.assumedTz) assumptions.push(`unrecognized timezone "${input.timezone}": assumed UTC`);
    const tz = { tz: r.tz.replace(" (assumed)", ""), offsetHours: r.offsetHours };
    const time = r.time;
    const deadlineAt = r.at;
    const planAt = r.conservativeAt;

    // Baseline snapshot for change detection. Failure here shouldn't block tracking.
    const snap = await fetchPage(input.url, ctx.abortSignal)
      .then((p) => snapshot(p.text))
      .catch(() => undefined);

    return update((db) => {
      const now = new Date().toISOString();
      const existing = db.challenges.find((c) => c.url === input.url || c.id === slugify(input.name));
      const prev = new Map(existing?.checklist.map((i) => [i.text.toLowerCase(), i]) ?? []);
      const challenge: Challenge = {
        id: existing?.id ?? slugify(input.name),
        name: input.name,
        url: input.url,
        deadlineAt,
        planAt,
        deadlineLabel: `${input.deadlineDate} ${time} ${tz.tz}`,
        deadlineAssumptions: assumptions,
        prizes: input.prizes,
        judgingCriteria: input.judgingCriteria,
        requiredKeywords: input.requiredKeywords,
        repoUrl: input.repoUrl ?? existing?.repoUrl,
        lastAudit: existing?.lastAudit,
        checklist: input.checklist.map((item, i) => {
          const p = prev.get(item.text.toLowerCase());
          return { id: `c${i + 1}`, text: item.text, required: item.required, done: p?.done ?? false, note: p?.note };
        }),
        snapshot: snap ?? existing?.snapshot,
        changes: existing?.changes ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      db.challenges = [...db.challenges.filter((c) => c.id !== challenge.id), challenge];
      return { tracked: challenge.id, updated: Boolean(existing), watching: Boolean(snap), ...viewOf(challenge) };
    });
  },
});
