// Publish hackdesk as an MCP server so a coding agent (Claude Code, Cursor, …)
// can ask "what's due?" or "audit this repo" mid-session. `tools: true` exposes
// hackdesk's deterministic tools directly (no model needed on this side); the
// agent_* tools hand whole tasks to hackdesk's own model loop.
//
//   claude mcp add --transport http hackdesk http://127.0.0.1:2000/eve/v1/mcp

import { localDev } from "eve/channels/auth";
import { mcpChannel } from "eve/channels/mcp";

export default mcpChannel({
  auth: localDev(), // local only; swap for oauthResource()/bearer auth before deploying
  tools: true,
});
