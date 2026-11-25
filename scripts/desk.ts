// hackdesk from the command line. No server and no model needed: it uses the same
// lib and the same db.json as the agent, board and MCP server.
//
//   node scripts/desk.ts list
//   node scripts/desk.ts track challenge.json        (or a JSON string; see TrackInput in lib/jobs.ts)
//   node scripts/desk.ts done <challengeId> <itemId> [note]
//   node scripts/desk.ts undo <challengeId> <itemId>
//   node scripts/desk.ts remind [--urgent-only]      (desktop notification + brief.md)
//   node scripts/desk.ts watch                       (diff tracked pages now)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildBrief, checkUpdates, saveBrief, trackChallenge, type TrackInput } from "../agent/lib/jobs.ts";
import { findChallenge, load, update } from "../agent/lib/store.ts";
import { sortByUrgency, viewOf, type ChallengeView } from "../agent/lib/view.ts";

// Task Scheduler / cron start us in an arbitrary directory; the store lives under the repo.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const [cmd, ...args] = process.argv.slice(2);

function line(v: ChallengeView): string {
  const next = v.openRequired[0] ? `${v.openRequired[0].id}: ${v.openRequired[0].text}` : "all required done ✓";
  const warn = v.unacknowledgedChanges.length ? "  ⚠ page changed" : "";
  return `${v.urgency.padEnd(11)} ${v.left.padStart(12)}  ${v.name}  (${v.progress.done}/${v.progress.total})\n${" ".repeat(26)}next → ${next}${warn}`;
}

async function views() {
  const db = await load();
  const now = new Date();
  return sortByUrgency(db.challenges.map((c) => viewOf(c, now)));
}

/** Windows toast via PowerShell's built-in WinRT API; macOS/Linux fall back to osascript / notify-send. */
async function notify(title: string, body: string, url?: string) {
  const { spawnSync } = await import("node:child_process");
  const xmlEsc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  if (process.platform === "win32") {
    const launch = url ? ` activationType="protocol" launch="${xmlEsc(url)}"` : "";
    const xml = `<toast${launch} scenario="reminder"><visual><binding template="ToastGeneric"><text>${xmlEsc(title)}</text><text>${xmlEsc(body)}</text></binding></visual><actions><action content="Open" activationType="protocol" arguments="${xmlEsc(url ?? "https://github.com/0xChand/hackdesk")}"/><action content="Dismiss" activationType="system" arguments="dismiss"/></actions></toast>`;
    const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml([Console]::In.ReadToEnd())
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { input: xml, encoding: "utf8" });
    if (r.status !== 0) console.error("toast failed:", r.stderr);
  } else if (process.platform === "darwin") {
    spawnSync("osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`]);
  } else {
    spawnSync("notify-send", [title, body]);
  }
}

switch (cmd) {
  case "list": {
    const v = await views();
    if (!v.length) console.log("Nothing tracked.");
    for (const x of v) console.log(line(x));
    break;
  }
  case "track": {
    const src = args[0];
    if (!src) throw new Error("usage: desk track <file.json | json>");
    const input = JSON.parse(existsSync(src) ? readFileSync(src, "utf8") : src) as TrackInput;
    const r = await trackChallenge(input);
    console.log(`${r.updated ? "updated" : "tracking"} ${r.tracked}: ${r.deadlineLabel} → ${r.left} left`);
    for (const a of r.deadlineAssumptions) console.log(`  ⚠ ${a}`);
    break;
  }
  case "done":
  case "undo": {
    const [id, item, ...note] = args;
    if (!id || !item) throw new Error(`usage: desk ${cmd} <challengeId> <itemId> [note]`);
    await update((db) => {
      const c = findChallenge(db, id);
      const i = c.checklist.find((x) => x.id === item);
      if (!i) throw new Error(`no item ${item}; items: ${c.checklist.map((x) => `${x.id} ${x.text}`).join(" | ")}`);
      i.done = cmd === "done";
      if (note.length) i.note = note.join(" ");
      c.updatedAt = new Date().toISOString();
    });
    console.log(`${cmd === "done" ? "✓" : "↺"} ${id} ${item}`);
    break;
  }
  case "watch": {
    const r = await checkUpdates();
    for (const x of r.results) console.log(`${x.id}: ${x.status}${"summary" in x ? ` (${x.summary})` : ""}`);
    break;
  }
  case "remind": {
    const urgentOnly = args.includes("--urgent-only");
    const all = (await views()).filter((v) => v.hoursLeft >= 0 && v.progress.requiredOpen > 0);
    const due = urgentOnly ? all.filter((v) => v.urgency === "critical" || v.unacknowledgedChanges.length) : all;
    await saveBrief(await buildBrief());
    if (!due.length) {
      console.log("nothing to remind");
      break;
    }
    const top = due[0]!;
    const title =
      due.length === 1
        ? `${top.name}: ${top.left} left`
        : `${due.length} hackathons open · ${top.name} first (${top.left})`;
    const body = due
      .slice(0, 3)
      .map((v) => `${v.left} · ${v.name} → ${v.openRequired[0]?.text ?? "done"}`)
      .join("\n");
    await notify(title, body, top.url);
    console.log(`${title}\n${body}`);
    break;
  }
  default:
    console.log("commands: list | track <json> | done <id> <item> [note] | undo <id> <item> | watch | remind [--urgent-only]");
}
