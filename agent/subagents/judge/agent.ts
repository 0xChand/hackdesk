import { defineAgent } from "eve";
import { model } from "../../lib/model";

export default defineAgent({
  description:
    "A strict hackathon judge. Send it the challenge's judging criteria, the repo audit findings, and the README excerpt; it returns a per-criterion score (1-10) with evidence and the three changes that would most raise the score before the deadline.",
  model: model(),
  reasoning: "high",
});
