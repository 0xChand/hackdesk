// Stubbed tool responses for evals, built with the real libraries so the shapes
// can never drift from what the tools return.
import { resolveDeadline } from "../../agent/lib/deadline.ts";
import { findDates } from "../../agent/lib/extract.ts";

/** A page with a launch date, a winners date and a PT deadline: the model must pick the right one. */
export function trapPage() {
  const text = [
    "Orbit Agents Hackathon",
    "Kickoff livestream on February 10, 2027.",
    "Submissions close March 3, 2027 at 11:59 PM PT. Late entries are not accepted.",
    "Winners announced March 20, 2027.",
    "Requirements: a public GitHub repo, a demo video under 3 minutes, and a Devpost submission.",
    "Projects must use the Orbit SDK (npm package orbit-sdk).",
    "Judging: Impact 40%, Technical depth 40%, Presentation 20%.",
    "Prizes: $5,000 grand prize.",
  ].join("\n");
  const dates = findDates(text, 2027);
  return {
    source: "https://orbit.example/hackathon",
    fetchedAt: "2027-02-01T00:00:00.000Z",
    deadlineCandidates: dates
      .filter((d) => d.looksLikeDeadline && d.iso)
      .map((d) => ({ ...resolveDeadline(d.iso!, d.near), evidence: d.context })),
    otherDates: dates.filter((d) => !d.looksLikeDeadline).map((d) => ({ iso: d.iso, context: d.context })),
    links: [],
    truncated: false,
    text,
  };
}

const view = (o: Record<string, unknown>) => ({
  deadlineAssumptions: [],
  planDiffers: false,
  openOptional: [],
  done: [],
  unacknowledgedChanges: [],
  judgingCriteria: [],
  addToGoogleCalendar: "https://calendar.google.com/",
  ...o,
});

/** Two tracked challenges: one comfortable, one closing in 20 hours with required work open. */
export function twoChallenges() {
  return {
    now: "2026-11-25T12:00:00.000Z",
    count: 2,
    challenges: [
      view({
        id: "nightshift-jam", name: "Nightshift Jam", url: "https://nightshift.example",
        deadlineAt: "2026-11-26T08:00:00.000Z", planAt: "2026-11-26T08:00:00.000Z", deadlineLabel: "2026-11-26 08:00 UTC",
        left: "20h 0m", hoursLeft: 20, urgency: "critical",
        progress: { done: 1, total: 3, requiredOpen: 2 },
        openRequired: [{ id: "c2", text: "Record 2-minute demo video" }, { id: "c3", text: "Submit on Devpost" }],
      }),
      view({
        id: "eve-builder-challenge", name: "eve Builder Challenge", url: "https://eve.dev/challenge",
        deadlineAt: "2026-12-11T23:59:59.000Z", planAt: "2026-12-10T10:00:00.000Z", planDiffers: true, deadlineLabel: "2026-12-11 23:59 UTC",
        left: "14d 22h", hoursLeft: 358, urgency: "comfortable",
        progress: { done: 2, total: 6, requiredOpen: 3 },
        openRequired: [{ id: "c4", text: "Public X post tagging @eve" }],
      }),
    ],
  };
}
