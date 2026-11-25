// The hackdesk board: a live dashboard, an iCalendar feed and a small JSON API,
// served by the same eve app as the agent. Board actions (tick an item, audit a
// repo, check for rule changes) run the agent's own tools directly through
// invokeTool, no model involved, so the board works even before a model is set up.

import { defineChannel, GET, POST } from "eve/channels";
import { createUnauthorizedResponse } from "eve/channels/auth";
import { renderBoard } from "../lib/board-html.ts";
import { toIcs } from "../lib/ics.ts";
import { load } from "../lib/store.ts";
import { briefMarkdown, sortByUrgency, viewOf } from "../lib/view.ts";

const BOARD_AUTH = { authenticator: "hackdesk-board", principalId: "hackdesk:board", principalType: "user", attributes: {} } as const;

/**
 * Open on loopback for local use. Anywhere else, require HACKDESK_BOARD_TOKEN as
 * ?token= (calendar apps can't send headers) or a Bearer header.
 */
function allowed(request: Request, requestIp: string | null): boolean {
  const token = process.env.HACKDESK_BOARD_TOKEN;
  if (token) {
    const url = new URL(request.url);
    const given = url.searchParams.get("token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return given === token;
  }
  return requestIp === null ? false : /^(127\.|::1$|::ffff:127\.)/.test(requestIp);
}

function deny() {
  return createUnauthorizedResponse({
    status: 401,
    message: "Set HACKDESK_BOARD_TOKEN and pass ?token=… (or open the board from localhost).",
    challenges: [{ scheme: "Bearer" }],
  });
}

async function views() {
  const db = await load();
  const now = new Date();
  return { now, db, views: sortByUrgency(db.challenges.map((c) => viewOf(c, now))) };
}

const ACTIONS = new Set(["update_checklist", "audit_repo", "check_updates", "list_challenges"]);

export default defineChannel({
  routes: [
    GET("/eve/v1/hackdesk", async (request, { requestIp }) => {
      if (!allowed(request, requestIp)) return deny();
      const { now, db, views: v } = await views();
      const token = new URL(request.url).searchParams.get("token");
      return new Response(renderBoard({ views: v, now, latestBrief: db.briefs[0] ?? null, brief: briefMarkdown(v, now), token }), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }),

    GET("/eve/v1/hackdesk/calendar.ics", async (request, { requestIp }) => {
      if (!allowed(request, requestIp)) return deny();
      const { db } = await views();
      return new Response(toIcs(db.challenges), {
        headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="hackdesk.ics"' },
      });
    }),

    GET("/eve/v1/hackdesk/api/challenges", async (request, { requestIp }) => {
      if (!allowed(request, requestIp)) return deny();
      const { now, views: v } = await views();
      return Response.json({ now: now.toISOString(), challenges: v, brief: briefMarkdown(v, now) });
    }),

    // Run one of the agent's tools directly: { tool, input }.
    POST("/eve/v1/hackdesk/api/run", async (request, { requestIp, invokeTool }) => {
      if (!allowed(request, requestIp)) return deny();
      const body = (await request.json().catch(() => null)) as { tool?: string; input?: unknown } | null;
      if (!body?.tool || !ACTIONS.has(body.tool)) {
        return Response.json({ ok: false, error: `tool must be one of ${[...ACTIONS].join(", ")}` }, { status: 400 });
      }
      const result = await invokeTool(body.tool, body.input ?? {}, { auth: BOARD_AUTH, signal: request.signal });
      if (result.outcome === "completed") return Response.json({ ok: true, output: result.output });
      return Response.json(
        { ok: false, error: result.outcome === "failed" ? result.error.message : result.reason },
        { status: result.outcome === "failed" ? 500 : 403 },
      );
    }),
  ],
});
