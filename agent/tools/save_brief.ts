import { defineTool } from "eve/tools";
import { z } from "zod";
import { load, save } from "../lib/store";

export default defineTool({
  description:
    "Save the deadline brief (markdown). Writes brief.md in the data dir and keeps the last 30 briefs. If HACKDESK_WEBHOOK_URL is set, also POSTs it there (Slack- and Discord-compatible JSON).",
  inputSchema: z.object({ markdown: z.string().min(1) }),
  async execute({ markdown }) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const db = await load();
    db.briefs = [{ at: new Date().toISOString(), markdown }, ...db.briefs].slice(0, 30);
    await save(db);
    const dir = process.env.HACKDESK_DATA_DIR ?? path.join(process.cwd(), ".hackdesk");
    await fs.writeFile(path.join(dir, "brief.md"), markdown);

    let delivered = false;
    const hook = process.env.HACKDESK_WEBHOOK_URL;
    if (hook) {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: markdown, content: markdown.slice(0, 1900) }),
      });
      delivered = res.ok;
    }
    return { saved: true, delivered };
  },
});
