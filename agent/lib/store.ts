// A tiny JSON-file store for tracked challenges. Lives outside the sandbox so it
// survives across sessions and schedule runs on a self-hosted / local agent.
// Point HACKDESK_DATA_DIR at a persistent volume in production.

export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
  note?: string;
}

export interface Challenge {
  id: string;
  name: string;
  url: string;
  deadline: string; // ISO date YYYY-MM-DD
  deadlineUtcOffsetHours: number;
  deadlineNote?: string; // e.g. "23:59 AoE"
  prizes?: string;
  judgingCriteria: string[];
  checklist: ChecklistItem[];
  repoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  challenges: Challenge[];
  briefs: { at: string; markdown: string }[];
}

async function paths() {
  const path = await import("node:path");
  const dir = process.env.HACKDESK_DATA_DIR ?? path.join(process.cwd(), ".hackdesk");
  return { dir, file: path.join(dir, "db.json") };
}

export async function load(): Promise<Db> {
  const fs = await import("node:fs/promises");
  const { file } = await paths();
  try {
    const db = JSON.parse(await fs.readFile(file, "utf8")) as Partial<Db>;
    return { challenges: db.challenges ?? [], briefs: db.briefs ?? [] };
  } catch {
    return { challenges: [], briefs: [] };
  }
}

export async function save(db: Db): Promise<void> {
  const fs = await import("node:fs/promises");
  const { dir, file } = await paths();
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, file); // atomic replace
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "challenge";
}

export async function getChallenge(id: string): Promise<{ db: Db; challenge: Challenge }> {
  const db = await load();
  const challenge = db.challenges.find((c) => c.id === id);
  if (!challenge) {
    const known = db.challenges.map((c) => c.id).join(", ") || "none";
    throw new Error(`No tracked challenge "${id}". Known ids: ${known}. Call list_challenges first.`);
  }
  return { db, challenge };
}
