import type { EveLanguageModel } from "eve";
import { anthropic } from "eve/models/anthropic";
import { openai } from "eve/models/openai";

/**
 * Pick a model from whatever credentials are present:
 * - ANTHROPIC_API_KEY  -> Claude direct
 * - OPENAI_API_KEY     -> OpenAI direct
 * - otherwise          -> AI Gateway id (AI_GATEWAY_API_KEY or Vercel OIDC)
 * HACKDESK_MODEL overrides the gateway model id.
 */
export function model(): EveLanguageModel | string {
  if (process.env.ANTHROPIC_API_KEY) return anthropic();
  if (process.env.OPENAI_API_KEY) return openai();
  return process.env.HACKDESK_MODEL ?? "openai/gpt-6-luna-fast";
}
