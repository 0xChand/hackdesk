import { defineTool } from "eve/tools";
import { z } from "zod";
import { auditRepo, fetchRepoFacts } from "../lib/audit";
import { load } from "../lib/store";

export default defineTool({
  description:
    "Audit a public GitHub repo for submission readiness: public visibility, README depth, run instructions, demo video link, screenshots, license, activity vs. the deadline, and required keywords (such as the framework the challenge mandates). Returns a 0-100 readiness score and pass/warn/fail findings.",
  inputSchema: z.object({
    repo: z.string().describe("owner/repo or a github.com URL"),
    challengeId: z.string().optional().describe("Tracked challenge to audit against (uses its deadline)."),
    requiredKeywords: z.array(z.string()).default([]),
  }),
  async execute({ repo, challengeId, requiredKeywords }) {
    const challenge = challengeId ? (await load()).challenges.find((c) => c.id === challengeId) : undefined;
    const facts = await fetchRepoFacts(repo);
    const { score, findings } = auditRepo(facts, { deadline: challenge?.deadline, requiredKeywords });
    return {
      repo: facts.fullName,
      score,
      findings,
      readmeExcerpt: facts.readme?.slice(0, 1500) ?? null,
      rootFiles: facts.rootFiles,
    };
  },
});
