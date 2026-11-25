import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchRepoFacts } from "../../../lib/audit.ts";

export default defineTool({
  description:
    "List files in a public GitHub repo (optionally filtered by a path substring or extension) plus its dependency names. Use it to find the code that implements what the README claims.",
  inputSchema: z.object({
    repo: z.string(),
    filter: z.string().optional().describe('Substring or extension, e.g. "agent/tools" or ".ts"'),
    limit: z.number().int().min(10).max(400).default(150),
  }),
  label: { start: () => "Listing repo files" },
  async execute({ repo, filter, limit }) {
    const facts = await fetchRepoFacts(repo);
    const f = filter?.toLowerCase();
    const paths = facts.paths.filter((p) => !/(^|\/)(node_modules|dist|\.next|vendor)\//.test(p) && (!f || p.toLowerCase().includes(f)));
    return { repo: facts.fullName, total: paths.length, files: paths.slice(0, limit), dependencies: facts.dependencies };
  },
});
