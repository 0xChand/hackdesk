import { defineEval } from "eve/evals";
import { twoChallenges } from "./fixtures/pages.ts";

export default defineEval({
  description: "Answers 'what should I work on' from list_challenges, leading with the challenge that closes first and its next required item.",
  tags: ["priorities"],
  async test(t) {
    const session = await t.session({
      stubs: [{ id: "list", tool: "list_challenges", outcome: { response: twoChallenges() } }],
    });
    const turn = await session.send("What should I work on right now?");
    turn.expectOk();
    turn.calledTool("list_challenges");
    turn.messageIncludes("Nightshift");
    turn.messageIncludes(/demo/i);
    if (process.env.AI_GATEWAY_API_KEY) t.judge("The reply puts Nightshift Jam (closing in ~20h) first and does not lead with the eve Builder Challenge.");
  },
});
