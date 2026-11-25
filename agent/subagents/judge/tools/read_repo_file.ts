import { defineTool } from "eve/tools";
import { z } from "zod";
import { readRepoFile } from "../../../lib/audit.ts";

export default defineTool({
  description: "Read one file from a public GitHub repo (first 12k chars) to verify a claim in code.",
  inputSchema: z.object({ repo: z.string(), path: z.string() }),
  label: { start: () => "Reading a repo file" },
  async execute({ repo, path }) {
    const text = await readRepoFile(repo, path);
    return { path, chars: text.length, truncated: text.length > 12000, content: text.slice(0, 12000) };
  },
});
