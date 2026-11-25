// Deterministic repo audit against a hackathon's submission checklist.
// The fetcher is injectable so tests run offline.

export interface RepoFacts {
  fullName: string;
  htmlUrl: string;
  isPublic: boolean;
  archived: boolean;
  description: string | null;
  homepage: string | null;
  license: string | null;
  defaultBranch: string;
  pushedAt: string;
  stars: number;
  topics: string[];
  readme: string | null;
  /** Every path in the default branch (capped by GitHub at ~100k entries). */
  paths: string[];
  /** Dependency names from package.json / requirements.txt / pyproject.toml / go.mod / Cargo.toml. */
  dependencies: string[];
  commitCount: number | null;
}

export interface Finding {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function parseRepo(input: string): { owner: string; repo: string } {
  const m = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/(tree|blob)\/.*$/, "")
    .match(/(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (!m) throw new Error(`Not a GitHub repo: "${input}". Use owner/repo or a github.com URL.`);
  return { owner: m[1]!, repo: m[2]! };
}

function ghHeaders(accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = { accept, "user-agent": "hackdesk-eve-agent", "x-github-api-version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Pull dependency names out of the common manifest formats. */
export function parseDependencies(file: string, content: string): string[] {
  const name = file.split("/").pop()!.toLowerCase();
  try {
    if (name === "package.json") {
      const p = JSON.parse(content);
      return Object.keys({ ...p.dependencies, ...p.devDependencies, ...p.peerDependencies });
    }
  } catch {
    return [];
  }
  if (name === "requirements.txt") {
    return content
      .split("\n")
      .map((l) => l.replace(/#.*/, "").trim().split(/[<>=!~\[; ]/)[0]!)
      .filter(Boolean);
  }
  if (name === "pyproject.toml" || name === "cargo.toml") {
    const out: string[] = [];
    for (const m of content.matchAll(/^\s*"?([A-Za-z0-9_.-]+)"?\s*(?:=|>=|==|~=|\^)/gm)) out.push(m[1]!);
    for (const m of content.matchAll(/"([A-Za-z0-9_.-]+)\s*(?:[<>=!~][^"]*)?"/g)) out.push(m[1]!);
    return [...new Set(out)];
  }
  if (name === "go.mod") {
    return [...content.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v/gm)].map((m) => m[1]!);
  }
  return [];
}

const MANIFESTS = /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml)$/i;

export async function fetchRepoFacts(input: string, fetcher: Fetcher = fetch): Promise<RepoFacts> {
  const { owner, repo } = parseRepo(input);
  const api = `https://api.github.com/repos/${owner}/${repo}`;

  const res = await fetcher(api, { headers: ghHeaders() });
  if (res.status === 404) {
    throw new Error(`${owner}/${repo} not found. It may be private, which most challenges disqualify.`);
  }
  if (res.status === 403) throw new Error(`GitHub rate limit hit. Set GITHUB_TOKEN to audit more repos.`);
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo}`);
  const r = (await res.json()) as any;

  const [readmeRes, treeRes, commitsRes] = await Promise.all([
    fetcher(`${api}/readme`, { headers: ghHeaders("application/vnd.github.raw") }),
    fetcher(`${api}/git/trees/${encodeURIComponent(r.default_branch)}?recursive=1`, { headers: ghHeaders() }),
    fetcher(`${api}/commits?per_page=1`, { headers: ghHeaders() }),
  ]);
  const readme = readmeRes.ok ? await readmeRes.text() : null;
  const tree = treeRes.ok ? ((await treeRes.json()) as { tree?: { path: string; type: string }[] }) : {};
  const paths = (tree.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path);

  // GitHub puts the last page number in the Link header; with per_page=1 that is the commit count.
  let commitCount: number | null = null;
  if (commitsRes.ok) {
    const link = commitsRes.headers.get("link") ?? "";
    const last = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
    commitCount = last ? Number(last[1]) : ((await commitsRes.json()) as unknown[]).length;
  }

  // Read up to 4 manifests, shallowest first (root package.json beats a nested example).
  const manifests = paths.filter((p) => MANIFESTS.test(p) && !p.includes("node_modules/"));
  manifests.sort((a, b) => a.split("/").length - b.split("/").length);
  const deps = new Set<string>();
  await Promise.all(
    manifests.slice(0, 4).map(async (p) => {
      const f = await fetcher(`${api}/contents/${p.split("/").map(encodeURIComponent).join("/")}`, {
        headers: ghHeaders("application/vnd.github.raw"),
      });
      if (f.ok) for (const d of parseDependencies(p, await f.text())) deps.add(d);
    }),
  );

  return {
    fullName: r.full_name,
    htmlUrl: r.html_url,
    isPublic: r.private === false,
    archived: Boolean(r.archived),
    description: r.description ?? null,
    homepage: r.homepage || null,
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at,
    stars: r.stargazers_count ?? 0,
    topics: r.topics ?? [],
    readme,
    paths,
    dependencies: [...deps],
    commitCount,
  };
}

/** Read one file from a public repo (for the judge to verify claims in code). */
export async function readRepoFile(input: string, path: string, fetcher: Fetcher = fetch): Promise<string> {
  const { owner, repo } = parseRepo(input);
  const clean = path.replace(/^\/+/, "");
  if (clean.split("/").some((s) => s === ".." || s === "")) throw new Error(`Bad path: ${path}`);
  const res = await fetcher(
    `https://api.github.com/repos/${owner}/${repo}/contents/${clean.split("/").map(encodeURIComponent).join("/")}`,
    { headers: ghHeaders("application/vnd.github.raw") },
  );
  if (!res.ok) throw new Error(`Could not read ${path} (HTTP ${res.status}).`);
  return await res.text();
}

const VIDEO_RE = /(youtube\.com\/(watch|shorts|live)|youtu\.be\/|loom\.com\/share|vimeo\.com\/\d)/i;
const IMG_RE = /!\[[^\]]*\]\(|<img\s|\.(gif|png|jpe?g|webp|svg)\b/i;
const RUN_RE = /(npm|pnpm|yarn|bun) (run|i\b|install|dev|start)|npx |pip install|uv (run|sync)|docker (run|compose)|cargo run|go run|```(bash|sh|shell|console)/i;
const DEPLOY_RE = /https?:\/\/[^\s)]+\.(vercel\.app|netlify\.app|pages\.dev|fly\.dev|onrender\.com|railway\.app|herokuapp\.com|streamlit\.app|hf\.space)\b/i;

export interface AuditOptions {
  deadlineAt?: string;
  requiredKeywords?: string[];
  now?: Date;
}

export function auditRepo(facts: RepoFacts, opts: AuditOptions = {}): { score: number; findings: Finding[] } {
  const f: Finding[] = [];
  const readme = facts.readme ?? "";
  const lower = readme.toLowerCase();
  const pathsLower = facts.paths.map((p) => p.toLowerCase());

  f.push(
    facts.isPublic
      ? { check: "public", status: "pass", detail: "Repository is public." }
      : { check: "public", status: "fail", detail: "Repository is not public.", fix: "Settings → Change visibility → Public." },
  );
  if (facts.archived) {
    f.push({ check: "archived", status: "warn", detail: "Repo is archived; judges may read that as abandoned.", fix: "Unarchive it." });
  }

  if (!facts.readme) {
    f.push({ check: "readme", status: "fail", detail: "No README. Judges land here first.", fix: "Add README.md: what, why, how to run, demo link." });
  } else {
    const words = readme.split(/\s+/).filter(Boolean).length;
    f.push({
      check: "readme",
      status: words >= 150 ? "pass" : "warn",
      detail: `README has ~${words} words.`,
      fix: words >= 150 ? undefined : "Explain the problem, what it does, and how to run it (150+ words).",
    });
    const hasRun = RUN_RE.test(readme);
    f.push({
      check: "run-instructions",
      status: hasRun ? "pass" : "warn",
      detail: hasRun ? "README shows how to run it." : "No setup/run commands found in README.",
      fix: hasRun ? undefined : "Add a copy-pasteable install + run block.",
    });
    const video = readme.match(VIDEO_RE);
    f.push({
      check: "demo-video",
      status: video ? "pass" : "warn",
      detail: video ? "README links a demo video." : "No demo video link (YouTube/Loom/Vimeo) in README.",
      fix: video ? undefined : "Record a 60-90s demo, upload, link it at the top of the README.",
    });
    const visual = IMG_RE.test(readme);
    f.push({
      check: "visuals",
      status: visual ? "pass" : "warn",
      detail: visual ? "README has images." : "No screenshots, GIFs or diagrams in README.",
      fix: visual ? undefined : "Add a screenshot or GIF above the fold.",
    });
  }

  const deploy = readme.match(DEPLOY_RE)?.[0] ?? facts.homepage;
  f.push({
    check: "live-link",
    status: deploy ? "pass" : "warn",
    detail: deploy ? `Live link: ${deploy}` : "No live deployment link found.",
    fix: deploy ? undefined : "Deploy it and put the URL in the README and the repo homepage field.",
  });

  const tests = pathsLower.filter((p) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|^test_.*\.py$|\/test_[^/]+\.py$|\.eval\.ts$/.test(p));
  f.push({
    check: "tests",
    status: tests.length ? "pass" : "warn",
    detail: tests.length ? `${tests.length} test/eval file(s).` : "No tests found.",
    fix: tests.length ? undefined : "Even a handful of tests signals engineering depth.",
  });
  const ci = pathsLower.some((p) => p.startsWith(".github/workflows/"));
  f.push({ check: "ci", status: ci ? "pass" : "warn", detail: ci ? "CI workflow present." : "No CI workflow.", fix: ci ? undefined : "Add a GitHub Action that runs the tests." });

  f.push(
    facts.license
      ? { check: "license", status: "pass", detail: `License: ${facts.license}.` }
      : { check: "license", status: "warn", detail: "No license detected.", fix: "Add a LICENSE file (MIT or Apache-2.0)." },
  );
  f.push({
    check: "description",
    status: facts.description ? "pass" : "warn",
    detail: facts.description ? "Repo description set." : "GitHub repo description is empty.",
    fix: facts.description ? undefined : "Set the one-line description and topics on GitHub.",
  });

  for (const kw of opts.requiredKeywords ?? []) {
    const k = kw.toLowerCase();
    const inDeps = facts.dependencies.some((d) => d.toLowerCase() === k || d.toLowerCase().startsWith(`${k}/`) || d.toLowerCase().startsWith(`@${k}/`));
    const inReadme = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower);
    const inPaths = pathsLower.some((p) => p.includes(k));
    const status = inDeps || (inReadme && inPaths) ? "pass" : inReadme || inPaths ? "warn" : "fail";
    const where = [inDeps && "dependencies", inReadme && "README", inPaths && "file paths"].filter(Boolean).join(", ");
    f.push({
      check: `uses:${kw}`,
      status,
      detail: status === "fail" ? `"${kw}" not found in dependencies, README or file paths.` : `"${kw}" found in ${where}.`,
      fix:
        status === "pass"
          ? undefined
          : inDeps
            ? undefined
            : `Judges check the challenge's required tech is really used; make "${kw}" visible in code and README.`,
    });
  }

  if (facts.commitCount !== null) {
    f.push({
      check: "history",
      status: facts.commitCount >= 3 ? "pass" : "warn",
      detail: `${facts.commitCount} commit(s).`,
      fix: facts.commitCount >= 3 ? undefined : "A single squashed commit can look like a copy; that's fine, but explain in the README.",
    });
  }

  if (opts.deadlineAt) {
    const now = opts.now ?? new Date();
    const pushed = new Date(facts.pushedAt);
    const cutoff = new Date(opts.deadlineAt);
    if (pushed > cutoff) {
      f.push({ check: "pushed-before-deadline", status: "warn", detail: `Last push ${facts.pushedAt} is after the deadline; some challenges judge the last pre-deadline commit.` });
    } else {
      const idleDays = Math.floor((now.getTime() - pushed.getTime()) / 86_400_000);
      f.push({ check: "recent-activity", status: idleDays > 14 ? "warn" : "pass", detail: `Last push ${idleDays} day(s) ago.` });
    }
  }

  const weight = { pass: 1, warn: 0.5, fail: 0 } as const;
  // Hard requirements count triple: a private repo or missing required tech sinks an entry.
  const w = (x: Finding) => (x.check === "public" || x.check === "readme" || x.check.startsWith("uses:") ? 3 : 1);
  const total = f.reduce((s, x) => s + w(x), 0);
  const got = f.reduce((s, x) => s + w(x) * weight[x.status], 0);
  return { score: Math.round((got / total) * 100), findings: f };
}
