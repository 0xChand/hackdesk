# hackdesk

**A submission desk for people who enter too many hackathons. Built with [eve](https://eve.dev).**

Give hackdesk a challenge URL. It reads the page and records the real deadline, with the timezone handled. It builds a checklist from the submission rules, audits your repo against that checklist, has a strict judge subagent score you on the challenge's own criteria, and drafts the announcement post within X's character limit. Every morning it writes a brief that lists what is due and the one thing to do next for each entry.

Entries rarely lose because the code is bad. They lose because of the fine print: a missed timezone, a repo that is still private, a forgotten tag in the post, no demo video. hackdesk is there to catch those.

```
you   > track https://eve.dev/challenge
desk  > read_challenge → found "Deadline December 11, 2026" (2 mentions, both deadline context)
        track_challenge → eve-builder-challenge, 5 checklist items
        Dec 11 (16 days). Open: public repo · X post tagging @eve + "Builder Challenge"
        · follow @eve · 100-char description · YouTube demo (optional, gets priority)

you   > audit github.com/me/my-agent and judge it
desk  > audit_repo → 72/100. FAIL: "eve" not mentioned in README. WARN: no demo video link…
        judge → Technical complexity 6/10 · Usefulness 7/10 · Creativity 5/10
        Top fixes: 1) 60-second Loom of the core loop  2) …

you   > draft the post
desk  > draft_post → 212/280 chars ✓  https://x.com/intent/post?text=…
```

## What's inside

| eve primitive | hackdesk uses it for |
| --- | --- |
| `agent/tools/read_challenge.ts` | Fetches the page and converts HTML to text. When the page is a JS shell it falls back to the `.md` version or `/llms.txt`. It returns every date with surrounding context and a deadline hint. Large pages go to the sandbox through `offloadContent`. |
| `agent/tools/track_challenge.ts` | Stores the deadline, its UTC offset (AoE, JST, PT…), prizes, judging criteria, and the checklist. Re-tracking a challenge keeps progress you already made. |
| `agent/tools/list_challenges.ts` | Sorts entries by urgency using timezone-correct days left, and lists the open required and optional items. |
| `agent/tools/audit_repo.ts` | A deterministic GitHub audit that returns a 0–100 score. It checks visibility, README depth, run instructions, demo video, screenshots, license, required keywords, and recent activity relative to the deadline. |
| `agent/subagents/judge/` | A blunt judge that scores 1–10 per criterion, cites evidence, and lists the top 3 fixes ranked by points gained per hour of work. |
| `agent/tools/draft_post.ts` | Counts characters the way X does (every URL counts as 23) and returns a compose link. It never posts by itself. |
| `agent/schedules/daily-brief.md` | Writes the 08:00 UTC brief to `.hackdesk/brief.md`. If `HACKDESK_WEBHOOK_URL` is set, it also posts the brief to a Slack or Discord webhook. |
| `agent/tools/update_checklist.ts` | Checks items off and attaches notes, such as the submitted URL. |
| `evals/` | An `eve eval` run against the real eve Builder Challenge page. |

The parsing, timezone, and audit logic lives in `agent/lib/` as pure functions with unit tests. The model makes the judgment calls, and the code supplies the facts.

## Run it

Requires Node 24+.

```bash
git clone https://github.com/0xChand/hackdesk && cd hackdesk
npm install
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY, or AI_GATEWAY_API_KEY
npm run dev                    # eve terminal UI
```

`agent/lib/model.ts` picks Claude when `ANTHROPIC_API_KEY` is set and OpenAI when `OPENAI_API_KEY` is set. Otherwise it uses an AI Gateway model, which `HACKDESK_MODEL` can override. Set `GITHUB_TOKEN` for higher GitHub API limits.

```bash
npm test          # unit tests (date parsing, timezones, audit scoring, X length)
npm run smoke     # live: parse eve.dev/challenge + audit a real repo, no model needed
npm run eval      # eve eval against the real challenge page (needs a model key)
npm run deploy    # eve deploy to Vercel
```

Example `npm run smoke` output:

```
https://eve.dev/challenge: 4449 chars of text
  DEADLINE? 2026-12-11  "…Judging Technical complexity Usefulness Creativity Deadline December 11, 2026"
  DEADLINE? 2026-12-11  "…Deadline December 11, 2026 How to enter Submit before December 11, 202…"

vercel/eve: readiness 94/100
  [pass] public: Repository is public.
  [warn] demo-video: No demo video link (YouTube/Loom) in README.
  ...
```

## Data

State is a JSON file at `.hackdesk/db.json`, written atomically. You can override the location with `HACKDESK_DATA_DIR`. On serverless hosts, point it at a mounted volume, or swap `agent/lib/store.ts` for KV or Postgres. The store's interface is three functions.

## License

Apache-2.0

Built for the [eve Builder Challenge](https://eve.dev/challenge).
