import { defineEval } from "eve/evals";
import { trapPage } from "./fixtures/pages.ts";

export default defineEval({
  description: "Picks the submission deadline (not kickoff or winners), keeps PT, and records the required SDK and the checklist.",
  tags: ["deadline"],
  async test(t) {
    const session = await t.session({
      stubs: [
        { id: "page", tool: "read_challenge", outcome: { response: trapPage() } },
        { id: "track", tool: "track_challenge", outcome: { response: { tracked: "orbit-agents-hackathon", updated: false, watching: true } } },
      ],
    });
    const turn = await session.send("Track https://orbit.example/hackathon for me.");
    turn.expectOk();
    turn.toolOrder(["read_challenge", "track_challenge"]);
    turn.calledTool("track_challenge", {
      input: (input: any) =>
        input.deadlineDate === "2027-03-03" &&
        /pt|pacific/i.test(`${input.timezone ?? ""} ${input.deadlineWording ?? ""}`) &&
        (input.requiredKeywords ?? []).some((k: string) => /orbit/i.test(k)) &&
        input.checklist.length >= 3,
    });
    turn.messageIncludes(/mar(ch)?\s*3/i);
  },
});
