import { defineEval } from "eve/evals";

export default defineEval({
  description: "For 'how strong is my entry', audits the repo first, then delegates to the judge subagent, which reads real code.",
  tags: ["judge"],
  timeoutMs: 300_000,
  async test(t) {
    const session = await t.session();
    const turn = await session.send(
      "Judge my eve Builder Challenge entry https://github.com/0xChand/hackdesk. Criteria: Technical complexity, Usefulness, Creativity. It must use eve.",
    );
    turn.expectOk();
    turn.toolOrder(["audit_repo", "judge"]);
    turn.messageIncludes(/\d+\s*\/\s*10/);
    if (process.env.AI_GATEWAY_API_KEY) t.judge("The reply gives a score per criterion (technical complexity, usefulness, creativity) and concrete fixes, citing specific files or findings.");
  },
});
