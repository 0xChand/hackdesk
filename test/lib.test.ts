import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLinks, findDates, htmlToText, xLength } from "../agent/lib/extract.ts";
import { findTime, findZone, humanizeLeft, resolveDeadline, toInstant, urgencyOf } from "../agent/lib/deadline.ts";
import { auditRepo, parseDependencies, parseRepo, type RepoFacts } from "../agent/lib/audit.ts";
import { diff, normalizeLines, snapshot } from "../agent/lib/watch.ts";
import { googleCalendarUrl, toIcs } from "../agent/lib/ics.ts";
import { briefMarkdown, viewOf } from "../agent/lib/view.ts";
import type { Challenge } from "../agent/lib/store.ts";

// ---------- extract ----------

test("htmlToText strips scripts, tags and entities", () => {
  const t = htmlToText("<p>Hi&nbsp;<b>there</b></p><script>alert(1)</script><div>Rules &amp; prizes</div>");
  assert.equal(t, "Hi there\nRules & prizes");
});

test("findDates normalizes formats and flags deadline context only from the same sentence", () => {
  const text = "Launched March 3, 2026. Submissions close December 11, 2026 at midnight. Winners 2026-12-20. Kickoff 5 Jan 2027.";
  const d = findDates(text);
  assert.deepEqual(d.map((x) => x.iso), ["2026-03-03", "2026-12-11", "2026-12-20", "2027-01-05"]);
  assert.deepEqual(d.map((x) => x.looksLikeDeadline), [false, true, false, false]);
  assert.match(d[1]!.near, /December 11, 2026 at midnight/);
});

test("findDates fills a missing year and rejects impossible dates", () => {
  assert.equal(findDates("Deadline: Nov 29", 2026)[0]!.iso, "2026-11-29");
  assert.equal(findDates("Feb 31, 2026")[0]!.iso, null);
  assert.equal(findDates("due 1st Dec 2026")[0]!.iso, "2026-12-01");
});

test("extractLinks resolves relative hrefs and dedupes", () => {
  const l = extractLinks('<a href="/docs">Docs</a><a href="/docs">again</a><a href="#x">no</a>', "https://eve.dev/challenge");
  assert.deepEqual(l, [{ href: "https://eve.dev/docs", text: "Docs" }]);
});

test("xLength counts URLs as 23", () => {
  assert.equal(xLength("hi https://github.com/a/very/long/path/that/goes/on"), 3 + 23);
});

// ---------- deadline ----------

test("findTime handles 12h, 24h, midnight and noon", () => {
  assert.equal(findTime("by 11:59 PM PT"), "23:59");
  assert.equal(findTime("at 9am"), "09:00");
  assert.equal(findTime("12 a.m."), "00:00");
  assert.equal(findTime("23:59 AoE"), "23:59");
  assert.equal(findTime("at midnight"), "23:59");
  assert.equal(findTime("noon JST"), "12:00");
  assert.equal(findTime("no time here"), null);
});

test("findZone resolves AoE, fixed zones, explicit offsets and US/EU DST", () => {
  assert.deepEqual(findZone("23:59 AoE", "2026-11-08"), { tz: "AoE", offsetHours: -12 });
  assert.deepEqual(findZone("23:59 JST", "2026-11-11"), { tz: "JST", offsetHours: 9 });
  assert.deepEqual(findZone("17:00 UTC+5:30", "2026-01-01"), { tz: "UTC+5:30", offsetHours: 5.5 });
  assert.equal(findZone("11:59 PM PT", "2026-07-01")!.offsetHours, -7); // PDT in summer
  assert.equal(findZone("11:59 PM PT", "2026-11-29")!.offsetHours, -8); // PST after Nov 1 2026
  assert.equal(findZone("11:59 PM PT", "2026-03-08")!.offsetHours, -7); // DST starts 2nd Sunday of March
  assert.equal(findZone("11:59 PM PT", "2026-03-07")!.offsetHours, -8);
  assert.equal(findZone("18:00 CET", "2026-07-01")!.offsetHours, 2);
  assert.equal(findZone("nothing", "2026-07-01"), null);
});

test("toInstant and resolveDeadline produce exact UTC instants", () => {
  assert.equal(toInstant("2026-11-08", "23:59", -12), "2026-11-09T11:59:59.000Z"); // AoE
  assert.equal(toInstant("2026-11-11", "23:59", 9), "2026-11-11T14:59:59.000Z"); // JST
  const r = resolveDeadline("2026-11-29", "Deadline November 29, 2026 at 11:59 PM PT");
  assert.equal(r.at, "2026-11-30T07:59:59.000Z");
  assert.equal(r.assumedTz, false);
  const a = resolveDeadline("2026-12-11", "Deadline December 11, 2026");
  assert.equal(a.at, "2026-12-11T23:59:59.000Z");
  assert.ok(a.assumedTime && a.assumedTz);
});

test("'Submit before <date>' with no time or zone plans for the earliest reading", () => {
  const r = resolveDeadline("2026-12-11", "How to enter Submit before December 11, 2026");
  assert.equal(r.at, "2026-12-11T23:59:59.000Z");
  // Start of Dec 11 at UTC+14 (the first place on Earth to reach it).
  assert.equal(r.conservativeAt, "2026-12-10T10:00:00.000Z");
  assert.ok(r.notes.some((n) => n.includes("before")));
  // An explicit time + zone removes the ambiguity.
  const exact = resolveDeadline("2026-11-08", "Submissions close Nov 8, 2026 23:59 AoE");
  assert.equal(exact.conservativeAt, exact.at);
  assert.deepEqual(exact.notes, []);
});

test("humanizeLeft and urgencyOf", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  assert.equal(humanizeLeft("2026-12-11T23:59:59Z", now), "16d 11h");
  assert.equal(humanizeLeft("2026-11-25T15:30:00Z", now), "3h 30m");
  assert.equal(humanizeLeft("2026-11-25T10:00:00Z", now), "overdue by 2h 0m");
  assert.equal(urgencyOf(-1), "overdue");
  assert.equal(urgencyOf(30), "critical");
  assert.equal(urgencyOf(100), "soon");
  assert.equal(urgencyOf(400), "comfortable");
});

// ---------- watch ----------

test("normalizeLines drops countdown noise so live timers don't look like changes", () => {
  const a = normalizeLines("Deadline December 11\n3 days 4 hours left\n120 participants\nSubmit a repo");
  const b = normalizeLines("Deadline December 11\n2 days 23 hours left\n131 participants\nSubmit a repo");
  assert.deepEqual(a, b);
});

test("diff reports added/removed lines and moved dates", () => {
  const before = snapshot("Deadline December 11, 2026\nSubmit a public repo", new Date("2026-11-25T00:00:00Z"));
  const same = snapshot("Deadline December 11, 2026\nSubmit a public repo", new Date("2026-11-26T00:00:00Z"));
  assert.equal(diff(before, same).changed, false);
  const after = snapshot("Deadline extended to December 18, 2026\nSubmit a public repo\nA demo video is now required", new Date("2026-11-27T00:00:00Z"));
  const d = diff(before, after);
  assert.equal(d.changed, true);
  assert.deepEqual(d.datesAdded, ["2026-12-18"]);
  assert.deepEqual(d.datesRemoved, ["2026-12-11"]);
  assert.ok(d.added.includes("A demo video is now required"));
});

// ---------- audit ----------

test("parseRepo accepts URLs, tree links and owner/repo", () => {
  assert.deepEqual(parseRepo("https://github.com/vercel/eve.git"), { owner: "vercel", repo: "eve" });
  assert.deepEqual(parseRepo("https://github.com/vercel/eve/tree/main/docs"), { owner: "vercel", repo: "eve" });
  assert.deepEqual(parseRepo("vercel/eve"), { owner: "vercel", repo: "eve" });
  assert.throws(() => parseRepo("not a repo"));
});

test("parseDependencies reads package.json, requirements.txt and pyproject", () => {
  assert.deepEqual(parseDependencies("package.json", JSON.stringify({ dependencies: { eve: "1" }, devDependencies: { typescript: "7" } })), ["eve", "typescript"]);
  assert.deepEqual(parseDependencies("requirements.txt", "fastapi>=0.1\n# c\nuvicorn[standard]==1\n"), ["fastapi", "uvicorn"]);
  assert.ok(parseDependencies("pyproject.toml", '[project]\ndependencies = ["langgraph>=0.2", "httpx"]').includes("langgraph"));
});

const base: RepoFacts = {
  fullName: "me/x", htmlUrl: "https://github.com/me/x", isPublic: true, archived: false, description: "d", homepage: null,
  license: "MIT", defaultBranch: "main", pushedAt: "2026-11-24T00:00:00Z", stars: 0, topics: [],
  readme: `# x\n${"word ".repeat(200)}\n\`\`\`bash\nnpm install\n\`\`\`\n![shot](a.png)\nhttps://youtu.be/abc\nhttps://x.vercel.app\nbuilt with eve`,
  paths: ["agent/agent.ts", "package.json", "test/a.test.ts", ".github/workflows/ci.yml"],
  dependencies: ["eve", "zod"],
  commitCount: 12,
};

test("auditRepo scores a complete repo 100", () => {
  const r = auditRepo(base, { deadlineAt: "2026-12-11T23:59:59Z", requiredKeywords: ["eve"], now: new Date("2026-11-25T00:00:00Z") });
  assert.equal(r.score, 100, JSON.stringify(r.findings.filter((f) => f.status !== "pass")));
});

test("auditRepo: README-only mention of required tech is a warning, absence is a fail", () => {
  const readmeOnly = auditRepo({ ...base, dependencies: ["zod"], paths: ["src/index.ts"] }, { requiredKeywords: ["eve"] });
  assert.equal(readmeOnly.findings.find((f) => f.check === "uses:eve")!.status, "warn");
  const absent = auditRepo(base, { requiredKeywords: ["langgraph"] });
  assert.equal(absent.findings.find((f) => f.check === "uses:langgraph")!.status, "fail");
});

test("auditRepo: private + no README sinks the score; every non-pass has a fix", () => {
  const r = auditRepo({ ...base, isPublic: false, readme: null, paths: [], dependencies: [], license: null }, { requiredKeywords: ["eve"] });
  assert.ok(r.score < 30, String(r.score));
  for (const f of r.findings) if (f.status === "fail") assert.ok(f.fix, `${f.check} has no fix`);
});

// ---------- view / ics ----------

const challenge: Challenge = {
  id: "eve-builder-challenge", name: "eve Builder Challenge", url: "https://eve.dev/challenge",
  deadlineAt: "2026-12-11T23:59:59.000Z", deadlineLabel: "2026-12-11 23:59 UTC", deadlineAssumptions: ["no timezone on page: assumed UTC"],
  prizes: "$100 AI Gateway credits", judgingCriteria: ["Technical complexity", "Usefulness", "Creativity"], requiredKeywords: ["eve"],
  checklist: [
    { id: "c1", text: "Public repo", required: true, done: true },
    { id: "c2", text: "Post on X tagging @eve", required: true, done: false },
    { id: "c3", text: "YouTube demo", required: false, done: false },
  ],
  changes: [], createdAt: "2026-11-25T00:00:00Z", updatedAt: "2026-11-25T00:00:00Z",
};

test("viewOf and briefMarkdown", () => {
  const now = new Date("2026-12-10T12:00:00Z");
  const v = viewOf(challenge, now);
  assert.equal(v.urgency, "critical");
  assert.deepEqual(v.progress, { done: 1, total: 3, requiredOpen: 1 });
  const md = briefMarkdown([v], now);
  assert.match(md, /## act today/);
  assert.match(md, /next: Post on X tagging @eve/);
});

test("toIcs emits a valid VEVENT with alarms and escaped text", () => {
  const ics = toIcs([challenge], new Date("2026-11-25T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTEND:20261211T235959Z/);
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 3);
  assert.match(ics.replace(/\r\n /g, ""), /Prizes: \$100 AI Gateway credits/); // unfold first
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
  assert.match(googleCalendarUrl(challenge), /dates=20261211T225959Z%2F20261211T235959Z/);
});
