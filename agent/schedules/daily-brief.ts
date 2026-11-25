// 08:00 UTC: write the deterministic brief (no model needed) and push it to
// the webhook if one is configured.
import { defineSchedule } from "eve/schedules";
import { buildBrief, saveBrief } from "../lib/jobs.ts";

export default defineSchedule({
  cron: "0 8 * * *",
  timezone: "UTC",
  async run({ waitUntil }) {
    waitUntil(buildBrief().then(saveBrief));
  },
});
