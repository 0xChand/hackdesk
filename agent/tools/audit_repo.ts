import { defineTool } from "eve/tools";
import { z } from "zod";
import { auditRepo, fetchRepoFacts } from "../lib/audit.ts";
import { load, update } from "../lib/store.ts";

export default defineTool({
  description:
    "Audit a public GitHub repo for submission readiness. Reads metadata, README, the full file tree and dependency manifests, then checks: public, README depth, run instructions, demo video, visuals, live link, tests, CI, license, description, commit history, activity vs. deadline, and that required tech is really used (dependencies, not just README mentions). Returns a 0-100 score and pass/warn/fail findings each with a fix. With challengeId, uses that challenge's deadline and required keywords and records the score.",
  inputSchema: z.object({
    repo: z.string().describe("owner/repo or a github.com URL"),
    challengeId: z.string().optional(),
    requiredKeywords: z.array(z.string()).default([]),
  }),
  label: { start: () => "Auditing the repo" },
  async execute({ repo, challengeId, requiredKeywords }) {
    const challenge = challengeId ? (await load()).challenges.find((c) => c.id === challengeId) : undefined;
    const keywords = [...new Set([...(challenge?.requiredKeywords ?? []), ...requiredKeywords])];
    const facts = await fetchRepoFacts(repo);
    const { score, findings } = auditRepo(facts, { deadlineAt: challenge?.deadlineAt, requiredKeywords: keywords });

    if (challenge) {
      await update((db) => {
        const c = db.challenges.find((x) => x.id === challenge.id);
        if (!c) return;
        c.repoUrl ??= facts.htmlUrl;
        c.lastAudit = { at: new Date().toISOString(), score, fails: findings.filter((f) => f.status === "fail").map((f) => f.check) };
      });
    }

    const order = { fail: 0, warn: 1, pass: 2 } as const;
    return {
      repo: facts.fullName,
      url: facts.htmlUrl,
      score,
      findings: [...findings].sort((a, b) => order[a.status] - order[b.status]),
      stats: { files: facts.paths.length, commits: facts.commitCount, stars: facts.stars, dependencies: facts.dependencies.length },
      topLevel: [...new Set(facts.paths.map((p) => p.split("/")[0]))].slice(0, 40),
      readmeExcerpt: facts.readme?.slice(0, 2000) ?? null,
    };
  },
});
