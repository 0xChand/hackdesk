import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, extractLinks, findDates, htmlToText, urgency, xLength } from "../agent/lib/extract.ts";
import { auditRepo, parseRepo, type RepoFacts } from "../agent/lib/audit.ts";

test("htmlToText strips scripts, tags and entities", () => {
  const t = htmlToText("<p>Hi&nbsp;<b>there</b></p><script>alert(1)</script><div>Rules &amp; prizes</div>");
  assert.equal(t, "Hi there\nRules & prizes");
});

test("findDates normalizes formats and flags deadline context", () => {
  const text = "Launched March 3, 2026. Submissions close December 11, 2026 at midnight. Winners 2026-12-20. Kickoff 5 Jan 2027.";
  const d = findDates(text);
  assert.deepEqual(d.map((x) => x.iso), ["2026-03-03", "2026-12-11", "2026-12-20", "2027-01-05"]);
  assert.equal(d[1]!.looksLikeDeadline, true);
  assert.equal(d[0]!.looksLikeDeadline, false);
});

test("findDates fills a missing year and rejects impossible dates", () => {
  assert.equal(findDates("Deadline: Nov 29", 2026)[0]!.iso, "2026-11-29");
  assert.equal(findDates("Feb 31, 2026")[0]!.iso, null);
});

test("daysUntil respects the deadline timezone", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  assert.equal(daysUntil("2026-12-11", now, 0), 16);
  // AoE (UTC-12) ends 12h later than UTC; JST ends 9h earlier.
  assert.equal(daysUntil("2026-11-25", new Date("2026-11-26T05:00:00Z"), -12), 0);
  assert.equal(daysUntil("2026-11-25", new Date("2026-11-25T16:00:00Z"), 9), -1);
  assert.equal(urgency(-1), "overdue");
  assert.equal(urgency(2), "critical");
  assert.equal(urgency(16), "comfortable");
});

test("extractLinks resolves relative hrefs and dedupes", () => {
  const l = extractLinks('<a href="/docs">Docs</a><a href="/docs">again</a><a href="#x">no</a>', "https://eve.dev/challenge");
  assert.deepEqual(l, [{ href: "https://eve.dev/docs", text: "Docs" }]);
});

test("xLength counts URLs as 23", () => {
  assert.equal(xLength("hi https://github.com/a/very/long/path/that/goes/on"), 3 + 23);
});

test("parseRepo accepts URLs and owner/repo", () => {
  assert.deepEqual(parseRepo("https://github.com/vercel/eve.git"), { owner: "vercel", repo: "eve" });
  assert.deepEqual(parseRepo("vercel/eve"), { owner: "vercel", repo: "eve" });
  assert.throws(() => parseRepo("not a repo"));
});

const base: RepoFacts = {
  fullName: "me/x", isPublic: true, archived: false, description: "d", license: "MIT",
  defaultBranch: "main", pushedAt: "2026-11-24T00:00:00Z", stars: 0, topics: [],
  readme: `# x\n${"word ".repeat(200)}\n\`\`\`bash\nnpm install\n\`\`\`\n![shot](a.png)\nhttps://youtu.be/abc\nbuilt with eve`,
  rootFiles: ["agent", "package.json"],
};

test("auditRepo scores a complete repo 100", () => {
  const r = auditRepo(base, { deadline: "2026-12-11", requiredKeywords: ["eve"], now: new Date("2026-11-25T00:00:00Z") });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
});

test("auditRepo fails private repos and missing keywords", () => {
  const r = auditRepo({ ...base, isPublic: false, readme: null }, { requiredKeywords: ["langgraph"] });
  const byCheck = Object.fromEntries(r.findings.map((f) => [f.check, f.status]));
  assert.equal(byCheck.public, "fail");
  assert.equal(byCheck.readme, "fail");
  assert.equal(byCheck["mentions:langgraph"], "fail");
  assert.ok(r.score < 50);
});
