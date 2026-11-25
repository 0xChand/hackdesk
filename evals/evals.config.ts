// LLM-as-judge assertions (t.judge) run only when AI_GATEWAY_API_KEY is set: the
// default decision model is Gateway-hosted. Deterministic assertions always run.
import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  timeoutMs: 180_000,
  maxConcurrency: 2,
  // Evals get a throwaway data dir so they never touch your real tracked challenges.
  async setup() {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    process.env.HACKDESK_DATA_DIR = await mkdtemp(join(tmpdir(), "hackdesk-eval-"));
    return {};
  },
});
