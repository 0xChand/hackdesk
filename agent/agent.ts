import { defineAgent } from "eve";
import { model } from "./lib/model";

export default defineAgent({
  description: "hackdesk: tracks hackathon deadlines, audits submissions, and drafts the entry post.",
  model: model(),
  reasoning: "high",
});
