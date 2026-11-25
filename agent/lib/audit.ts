// Deterministic repo audit against a hackathon's submission checklist.
// The GitHub fetch is injectable so tests can run offline.

export interface RepoFacts {
  fullName: string;
  isPublic: boolean;
  archived: boolean;
  description: string | null;
  license: string | null;
  defaultBranch: string;
  pushedAt: string;
  stars: number;
  topics: string[];
  readme: string | null;
  rootFiles: string[];
}

export interface Finding {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function parseRepo(input: string): { owner: string; repo: string } {
  const m = input
    .trim()
    .replace(/\.git$/, "")
    .match(/(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (!m) throw new Error(`Not a GitHub repo: "${input}". Use owner/repo or a github.com URL.`);
  return { owner: m[1]!, repo: m[2]! };
}

export async function fetchRepoFacts(input: string, fetcher: Fetcher = fetch): Promise<RepoFacts> {
  const { owner, repo } = parseRepo(input);
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "hackdesk-eve-agent",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${owner}/${repo}`;

  const res = await fetcher(api, { headers });
  if (res.status === 404) {
    throw new Error(`${owner}/${repo} not found. It may be private, which most challenges disqualify.`);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo}`);
  const r = (await res.json()) as any;

  const [readmeRes, contentsRes] = await Promise.all([
    fetcher(`${api}/readme`, { headers: { ...headers, accept: "application/vnd.github.raw" } }),
    fetcher(`${api}/contents`, { headers }),
  ]);
  const readme = readmeRes.ok ? await readmeRes.text() : null;
  const contents = contentsRes.ok ? ((await contentsRes.json()) as { name: string }[]) : [];

  return {
    fullName: r.full_name,
    isPublic: r.private === false,
    archived: Boolean(r.archived),
    description: r.description ?? null,
    license: r.license?.spdx_id ?? null,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at,
    stars: r.stargazers_count ?? 0,
    topics: r.topics ?? [],
    readme,
    rootFiles: Array.isArray(contents) ? contents.map((c) => c.name) : [],
  };
}

const VIDEO_RE = /(youtube\.com\/watch|youtu\.be\/|loom\.com\/share|vimeo\.com\/\d)/i;

export function auditRepo(
  facts: RepoFacts,
  opts: { deadline?: string; requiredKeywords?: string[]; now?: Date } = {},
): { score: number; findings: Finding[] } {
  const f: Finding[] = [];
  const readme = facts.readme ?? "";
  const lower = readme.toLowerCase();

  f.push(
    facts.isPublic
      ? { check: "public", status: "pass", detail: "Repository is public." }
      : { check: "public", status: "fail", detail: "Repository is not public." },
  );
  if (facts.archived) f.push({ check: "archived", status: "warn", detail: "Repo is archived; judges may read that as abandoned." });

  if (!facts.readme) {
    f.push({ check: "readme", status: "fail", detail: "No README. Judges land here first." });
  } else {
    const words = readme.split(/\s+/).filter(Boolean).length;
    f.push({
      check: "readme",
      status: words >= 150 ? "pass" : "warn",
      detail: `README has ~${words} words${words < 150 ? "; explain what it does, why, and how to run it" : ""}.`,
    });
    const hasRun = /(npm|pnpm|yarn|bun) (run|i|install|dev|start)|npx |```(bash|sh|shell)/i.test(readme);
    f.push({
      check: "run-instructions",
      status: hasRun ? "pass" : "warn",
      detail: hasRun ? "README shows how to run it." : "No setup/run commands found in README.",
    });
    f.push({
      check: "demo-video",
      status: VIDEO_RE.test(readme) ? "pass" : "warn",
      detail: VIDEO_RE.test(readme) ? "README links a demo video." : "No demo video link (YouTube/Loom) in README.",
    });
    f.push({
      check: "visuals",
      status: /!\[[^\]]*\]\(|<img\s/i.test(readme) ? "pass" : "warn",
      detail: /!\[[^\]]*\]\(|<img\s/i.test(readme) ? "README has images." : "No screenshots or diagrams in README.",
    });
  }

  f.push(
    facts.license
      ? { check: "license", status: "pass", detail: `License: ${facts.license}.` }
      : { check: "license", status: "warn", detail: "No license detected." },
  );
  f.push({
    check: "description",
    status: facts.description ? "pass" : "warn",
    detail: facts.description ? `Repo description set.` : "GitHub repo description is empty.",
  });

  for (const kw of opts.requiredKeywords ?? []) {
    const ok = lower.includes(kw.toLowerCase()) || facts.rootFiles.some((n) => n.toLowerCase().includes(kw.toLowerCase()));
    f.push({
      check: `mentions:${kw}`,
      status: ok ? "pass" : "fail",
      detail: ok ? `"${kw}" found.` : `"${kw}" not found in README or root files.`,
    });
  }

  if (opts.deadline) {
    const now = opts.now ?? new Date();
    const pushed = new Date(facts.pushedAt);
    const deadlineEnd = new Date(`${opts.deadline.slice(0, 10)}T23:59:59Z`);
    if (pushed > deadlineEnd) {
      f.push({ check: "pushed-before-deadline", status: "warn", detail: `Last push ${facts.pushedAt} is after the deadline.` });
    } else {
      const idleDays = Math.floor((now.getTime() - pushed.getTime()) / 86_400_000);
      f.push({
        check: "recent-activity",
        status: idleDays > 14 ? "warn" : "pass",
        detail: `Last push ${idleDays} day(s) ago.`,
      });
    }
  }

  const weight = { pass: 1, warn: 0.5, fail: 0 } as const;
  const score = Math.round((f.reduce((s, x) => s + weight[x.status], 0) / f.length) * 100);
  return { score, findings: f };
}
