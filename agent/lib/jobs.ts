// Work shared by tools and schedules. Schedules call these directly, so the
// watcher and the daily brief run without a model.

import { fetchPage } from "./page.ts";
import { dataDir, update } from "./store.ts";
import { briefMarkdown, sortByUrgency, viewOf } from "./view.ts";
import { diff, snapshot } from "./watch.ts";

export type CheckResult =
  | { id: string; status: "baseline" | "unchanged" }
  | { id: string; status: "error"; error: string }
  | {
      id: string;
      status: "changed";
      summary: string;
      added: string[];
      removed: string[];
      datesAdded: string[];
      datesRemoved: string[];
      deadlineMayHaveMoved: boolean;
    };

export async function checkUpdates(challengeId?: string, signal?: AbortSignal) {
  return update(async (db) => {
    const targets = db.challenges.filter(
      (c) => (challengeId ? c.id === challengeId : true) && new Date(c.deadlineAt).getTime() > Date.now() - 86_400_000,
    );
    const results: CheckResult[] = await Promise.all(
      targets.map(async (c): Promise<CheckResult> => {
        try {
          const next = snapshot((await fetchPage(c.url, signal)).text);
          if (!c.snapshot) {
            c.snapshot = next;
            return { id: c.id, status: "baseline" };
          }
          const d = diff(c.snapshot, next);
          c.snapshot = next;
          if (!d.changed) return { id: c.id, status: "unchanged" };
          const summary = [
            d.datesAdded.length ? `dates added ${d.datesAdded.join(", ")}` : "",
            d.datesRemoved.length ? `dates removed ${d.datesRemoved.join(", ")}` : "",
            `${d.added.length} line(s) added, ${d.removed.length} removed`,
          ]
            .filter(Boolean)
            .join("; ");
          c.changes = [{ at: next.at, summary, ...d, acknowledged: false }, ...c.changes].slice(0, 20);
          c.updatedAt = next.at;
          return {
            id: c.id,
            status: "changed",
            summary,
            added: d.added,
            removed: d.removed,
            datesAdded: d.datesAdded,
            datesRemoved: d.datesRemoved,
            deadlineMayHaveMoved: d.datesAdded.length + d.datesRemoved.length > 0,
          };
        } catch (e) {
          return { id: c.id, status: "error", error: (e as Error).message };
        }
      }),
    );
    return { checked: results.length, changed: results.filter((r) => r.status === "changed").length, results };
  });
}

export async function postWebhook(markdown: string): Promise<boolean | null> {
  const hook = process.env.HACKDESK_WEBHOOK_URL;
  if (!hook) return null;
  const res = await fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // `text` for Slack, `content` for Discord (2000-char cap).
    body: JSON.stringify({ text: markdown, content: markdown.slice(0, 1900) }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function saveBrief(markdown: string): Promise<{ saved: true; delivered: boolean | null }> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await update((db) => {
    db.briefs = [{ at: new Date().toISOString(), markdown }, ...db.briefs].slice(0, 30);
  });
  await fs.writeFile(path.join(await dataDir(), "brief.md"), markdown);
  return { saved: true, delivered: await postWebhook(markdown) };
}

export async function buildBrief(now = new Date()): Promise<string> {
  const { load } = await import("./store.ts");
  const db = await load();
  return briefMarkdown(sortByUrgency(db.challenges.map((c) => viewOf(c, now))), now);
}
