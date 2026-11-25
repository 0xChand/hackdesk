// A tiny JSON-file store for tracked challenges. Lives outside the sandbox so it
// survives across sessions, schedule runs and MCP calls on a self-hosted or
// local agent. Point HACKDESK_DATA_DIR at a persistent volume in production.

import type { Snapshot } from "./watch.ts";

export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
  note?: string;
}

export interface ChangeEvent {
  at: string;
  summary: string;
  added: string[];
  removed: string[];
  datesAdded: string[];
  datesRemoved: string[];
  acknowledged: boolean;
}

export interface Challenge {
  id: string;
  name: string;
  url: string;
  /** Exact submission cutoff as a UTC instant. */
  deadlineAt: string;
  /** Earliest reasonable reading of the deadline (e.g. "before Dec 11" → Dec 11 00:00). Plan against this. */
  planAt?: string;
  /** How the page phrased it, e.g. "Dec 11, 2026 23:59 AoE". */
  deadlineLabel: string;
  deadlineAssumptions: string[];
  prizes?: string;
  judgingCriteria: string[];
  requiredKeywords: string[];
  checklist: ChecklistItem[];
  repoUrl?: string;
  lastAudit?: { at: string; score: number; fails: string[] };
  snapshot?: Snapshot;
  changes: ChangeEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface Brief {
  at: string;
  markdown: string;
}

export interface Db {
  version: 2;
  challenges: Challenge[];
  briefs: Brief[];
}

async function paths() {
  const path = await import("node:path");
  const dir = process.env.HACKDESK_DATA_DIR ?? path.join(process.cwd(), ".hackdesk");
  return { dir, file: path.join(dir, "db.json") };
}

export async function dataDir(): Promise<string> {
  return (await paths()).dir;
}

/** Upgrade v1 records (date + offset) to v2 (exact instant). */
function migrate(raw: any): Db {
  const challenges: Challenge[] = (raw?.challenges ?? []).map((c: any) => {
    if (c.deadlineAt) return { changes: [], requiredKeywords: [], deadlineAssumptions: [], ...c };
    const off = Number(c.deadlineUtcOffsetHours ?? 0);
    const [y, m, d] = String(c.deadline).split("-").map(Number) as [number, number, number];
    const at = new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - off * 3_600_000).toISOString();
    return {
      ...c,
      deadlineAt: at,
      deadlineLabel: `${c.deadline} 23:59 UTC${off >= 0 ? "+" : ""}${off}`,
      deadlineAssumptions: [],
      requiredKeywords: [],
      changes: [],
    };
  });
  return { version: 2, challenges, briefs: raw?.briefs ?? [] };
}

export async function load(): Promise<Db> {
  const fs = await import("node:fs/promises");
  const { file } = await paths();
  try {
    return migrate(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return { version: 2, challenges: [], briefs: [] };
  }
}

export async function save(db: Db): Promise<void> {
  const fs = await import("node:fs/promises");
  const { dir, file } = await paths();
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, file); // atomic replace
}

/** Load, mutate, save. Serialized within this process so parallel tool calls don't clobber each other. */
let chain: Promise<unknown> = Promise.resolve();
export function update<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "challenge";
}

export function findChallenge(db: Db, id: string): Challenge {
  const c = db.challenges.find((x) => x.id === id) ?? db.challenges.find((x) => x.id.includes(id) || x.url === id);
  if (!c) {
    const known = db.challenges.map((x) => x.id).join(", ") || "none";
    throw new Error(`No tracked challenge "${id}". Known ids: ${known}. Call list_challenges first.`);
  }
  return c;
}
