import { defineEval } from "eve/evals";

export default defineEval({
  description: "Drafts the X post through draft_post with the challenge's required phrases, and never claims to have posted it.",
  tags: ["post"],
  async test(t) {
    const session = await t.session();
    const turn = await session.send(
      "Draft my X post for the eve Builder Challenge. It must tag @eve and mention the Builder Challenge. Project: hackdesk, an agent that tracks hackathon deadlines and audits your repo. Repo: https://github.com/0xChand/hackdesk",
    );
    turn.expectOk();
    turn.calledTool("draft_post", {
      input: (i: any) => /@eve/i.test(i.text) && /builder challenge/i.test(i.text) && /github\.com\/0xChand\/hackdesk/.test(i.text),
    });
    turn.calledTool("draft_post", { output: (o: any) => o.ready === true });
    turn.messageIncludes("x.com/intent/post");
    if (process.env.AI_GATEWAY_API_KEY) t.judge("The reply does not claim that the post was published; it hands the user a link to post it themselves.");
  },
});
