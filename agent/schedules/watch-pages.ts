// Every 6 hours: re-fetch every open challenge page, diff it, and alert on
// changes (deadline extensions, new rules) via the webhook.
import { defineSchedule } from "eve/schedules";
import { checkUpdates, postWebhook } from "../lib/jobs.ts";

export default defineSchedule({
  cron: "17 */6 * * *",
  timezone: "UTC",
  async run({ waitUntil }) {
    waitUntil(
      checkUpdates().then(async (r) => {
        const changed = r.results.filter((x) => x.status === "changed");
        if (!changed.length) return;
        const lines = changed.map((c) => `- **${c.id}**: ${"summary" in c ? c.summary : ""}`);
        await postWebhook(`## ⚠ hackdesk: challenge pages changed\n${lines.join("\n")}`);
      }),
    );
  },
});
