// One canonical "where does this challenge stand" view, shared by the
// list_challenges tool, the daily brief, the board page and the JSON API.

import { hoursLeft, humanizeLeft, urgencyOf } from "./deadline.ts";
import { googleCalendarUrl } from "./ics.ts";
import type { Challenge } from "./store.ts";

export interface ChallengeView {
  id: string;
  name: string;
  url: string;
  deadlineAt: string;
  /** Earliest reasonable reading of the cutoff; countdowns and urgency use this. */
  planAt: string;
  planDiffers: boolean;
  deadlineLabel: string;
  deadlineAssumptions: string[];
  left: string;
  hoursLeft: number;
  urgency: ReturnType<typeof urgencyOf>;
  progress: { done: number; total: number; requiredOpen: number };
  openRequired: { id: string; text: string }[];
  openOptional: { id: string; text: string }[];
  done: { id: string; text: string; note?: string }[];
  repoUrl?: string;
  lastAudit?: Challenge["lastAudit"];
  unacknowledgedChanges: { at: string; summary: string }[];
  judgingCriteria: string[];
  prizes?: string;
  addToGoogleCalendar: string;
}

export function viewOf(c: Challenge, now = new Date()): ChallengeView {
  const planAt = c.planAt ?? c.deadlineAt;
  const h = hoursLeft(planAt, now);
  const open = c.checklist.filter((i) => !i.done);
  return {
    id: c.id,
    name: c.name,
    url: c.url,
    deadlineAt: c.deadlineAt,
    planAt,
    planDiffers: planAt !== c.deadlineAt,
    deadlineLabel: c.deadlineLabel,
    deadlineAssumptions: c.deadlineAssumptions,
    left: humanizeLeft(planAt, now),
    hoursLeft: Math.round(h * 10) / 10,
    urgency: urgencyOf(h),
    progress: {
      done: c.checklist.length - open.length,
      total: c.checklist.length,
      requiredOpen: open.filter((i) => i.required).length,
    },
    openRequired: open.filter((i) => i.required).map(({ id, text }) => ({ id, text })),
    openOptional: open.filter((i) => !i.required).map(({ id, text }) => ({ id, text })),
    done: c.checklist.filter((i) => i.done).map(({ id, text, note }) => ({ id, text, note })),
    repoUrl: c.repoUrl,
    lastAudit: c.lastAudit,
    unacknowledgedChanges: c.changes.filter((x) => !x.acknowledged).map(({ at, summary }) => ({ at, summary })),
    judgingCriteria: c.judgingCriteria,
    prizes: c.prizes,
    addToGoogleCalendar: googleCalendarUrl(c),
  };
}

/** Most urgent first; among equals, the one with more required work open. */
export function sortByUrgency(views: ChallengeView[]): ChallengeView[] {
  return [...views].sort((a, b) => a.hoursLeft - b.hoursLeft || b.progress.requiredOpen - a.progress.requiredOpen);
}

/** Deterministic brief (used as a fallback when no model is configured, and as the board header). */
export function briefMarkdown(views: ChallengeView[], now = new Date()): string {
  const live = sortByUrgency(views.filter((v) => v.hoursLeft >= 0));
  const today = now.toISOString().slice(0, 10);
  if (!live.length) return `# hackdesk brief — ${today}\n\nNothing tracked with an open deadline.`;
  const line = (v: ChallengeView) => {
    const next = v.openRequired[0]?.text ?? v.openOptional[0]?.text ?? "all done ✓";
    const changed = v.unacknowledgedChanges.length ? ` · ⚠ page changed` : "";
    const plan = v.planDiffers ? ` (plan for ${v.planAt.slice(0, 16).replace("T", " ")} UTC)` : "";
    return `- **${v.name}** — ${v.deadlineLabel}${plan} · **${v.left} left** · ${v.progress.done}/${v.progress.total} · next: ${next}${changed}`;
  };
  const hot = live.filter((v) => v.urgency === "critical" || v.unacknowledgedChanges.length);
  const rest = live.filter((v) => !hot.includes(v));
  return [
    `# hackdesk brief — ${today}`,
    hot.length ? `\n## act today\n${hot.map(line).join("\n")}` : "",
    rest.length ? `\n## on deck\n${rest.map(line).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
