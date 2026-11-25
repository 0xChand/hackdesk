// Talk to a running hackdesk (npm run dev) from the terminal and watch it work:
// tool calls, subagent delegation and the streamed reply.
//
//   node scripts/chat.ts "track https://eve.dev/challenge" "what should I do next?"
//
// Each argument is one turn in the same session. Set HACKDESK_URL for a deployed agent.

const base = process.env.HACKDESK_URL ?? "http://127.0.0.1:2000";
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function post(path: string, body: unknown) {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as { ok: boolean; sessionId?: string; error?: string };
  if (!j.ok) throw new Error(`${r.status} ${j.error ?? JSON.stringify(j)}`);
  return j;
}

/** Follow the session stream until the current turn settles. */
async function follow(sessionId: string, seenTurns: Set<string>): Promise<void> {
  const res = await fetch(`${base}/eve/v1/session/${sessionId}/stream`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let streaming = false;
  const started = new Map<string, number>();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      const old = (x: any) => x?.scope?.turnId && seenTurns.has(x.scope.turnId);
      const p = ev.progress;
      if (p && !old(p) && p.type === "content.delta" && typeof p.data?.delta === "string" && !p.data.kind) {
        if (!streaming) process.stdout.write(`\n${bold("hackdesk")} `);
        streaming = true;
        process.stdout.write(p.data.delta);
      }
      for (const f of ev.facts ?? []) {
        if (old(f)) continue;
        if (f.type === "call.requested" && !f.data.capability?.hidden && f.data.capability?.kind !== "control") {
          if (streaming) process.stdout.write("\n");
          streaming = false;
          const c = f.data.capability;
          started.set(f.data.callId, Date.now());
          const arg = JSON.stringify(f.data.input ?? {});
          console.log(cyan(`  → ${c.kind === "agent" ? "delegating to " : ""}${c.name}`) + dim(` ${arg.length > 110 ? arg.slice(0, 107) + "…" : arg}`));
        }
        if (f.type === "call.settled") {
          const ms = started.has(f.data.callId) ? Date.now() - started.get(f.data.callId)! : 0;
          if (f.data.outcome !== "completed") console.log(red(`    ✗ ${f.data.error?.message ?? f.data.outcome}`));
          else if (ms) console.log(dim(`    ✓ ${(ms / 1000).toFixed(1)}s`));
        }
        if (f.type === "turn.settled") {
          seenTurns.add(f.data.turnId);
          if (f.data.outcome === "failed") console.log(red(`\n✗ ${f.data.error?.message}`));
          process.stdout.write("\n");
          await reader.cancel();
          return;
        }
      }
    }
  }
}

const turns = process.argv.slice(2);
if (!turns.length) {
  console.error('usage: node scripts/chat.ts "message" ["follow-up" ...]');
  process.exit(1);
}
let sessionId: string | undefined;
const seen = new Set<string>();
for (const message of turns) {
  console.log(`\n${bold("you")} ${message}`);
  const r = sessionId ? await post(`/eve/v1/session/${sessionId}`, { message }) : await post("/eve/v1/session", { message });
  sessionId = r.sessionId!;
  await follow(sessionId, seen);
}

export {};
