// Live smoke test (network): runs the same logic the tools use against the real
// eve Builder Challenge page and a real repo. `npm run smoke`
import { findDates, htmlToText } from "../agent/lib/extract.ts";
import { auditRepo, fetchRepoFacts } from "../agent/lib/audit.ts";

const url = process.argv[2] ?? "https://eve.dev/challenge";
const repo = process.argv[3] ?? "vercel/eve";

const html = await (await fetch(url)).text();
const text = htmlToText(html);
const dates = findDates(text, new Date().getUTCFullYear());
console.log(`${url}: ${text.length} chars of text`);
for (const d of dates) console.log(`  ${d.looksLikeDeadline ? "DEADLINE?" : "         "} ${d.iso}  "${d.context.slice(0, 110)}"`);

const facts = await fetchRepoFacts(repo);
const { score, findings } = auditRepo(facts, { deadline: dates.find((d) => d.looksLikeDeadline)?.iso ?? undefined, requiredKeywords: ["eve"] });
console.log(`\n${facts.fullName}: readiness ${score}/100`);
for (const f of findings) console.log(`  [${f.status}] ${f.check}: ${f.detail}`);
