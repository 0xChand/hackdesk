---
cron: "0 8 * * *"
timezone: "UTC"
---

Write today's hackathon brief.

1. Call `list_challenges`.
2. Write a short markdown brief. Start with `# hackdesk brief — <today>`. Then add one line per challenge, most urgent first: name, deadline, **days left**, progress, and the single most important open required item. Put any challenge marked `critical` or `overdue` at the top under `## act today`.
3. When nothing is tracked, the brief is one line that says so.
4. Call `save_brief` with the markdown.
