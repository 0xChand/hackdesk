import { defineEval } from "eve/evals";

export default defineEval({
  description: "Reads the real eve Builder Challenge page, picks the right deadline, and tracks it with a checklist.",
  async test(t) {
    const session = await t.session();
    const turn = await session.send("Track this challenge for me: https://eve.dev/challenge");
    turn.expectOk();
    turn.calledTool("read_challenge");
    turn.calledTool("track_challenge");
    turn.toolOrder(["read_challenge", "track_challenge"]);
    turn.messageIncludes("Dec");
  },
});
