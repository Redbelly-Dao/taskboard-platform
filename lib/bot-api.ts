import { NextRequest, NextResponse } from "next/server";
import type { Cycle } from "./cycle";
import { cyclePhase, countdownLabel, daysUntil } from "./cycle";

// Read-only surface for Berlin's Discord bot. Everything here is data the board already shows publicly,
// reshaped so the bot does not have to scrape pages or hold Firebase credentials of its own.
//
// Two rules govern what may be added to this file.
// Nothing that identifies a person ever goes out: no wallets, emails, usernames, Discord handles, or reviewer assignments.
// Nothing about submissions goes out beyond an aggregate count, since a submission is between the contributor and the reviewer.

const DEFAULT_MAX_SUBMISSIONS = 5;

// Fails closed. An unset BOT_API_KEY means the endpoints are shut, not open,
// which keeps a half-configured deploy from publishing the board's task list to anyone who guesses the path.
export function authorizeBot(req: NextRequest): NextResponse | null {
  const expected = process.env.BOT_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "Bot API is not configured" }, { status: 503 });
  }
  const header = req.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function botError(err: unknown, label: string): NextResponse {
  console.error(`${label} error:`, err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

// The bot polls on a timer and Discord slash commands expect a reply inside 3 seconds,
// so successful responses carry a short shared-cache window rather than being recomputed per call.
export function botJson(body: unknown, seconds = 60): NextResponse {
  return NextResponse.json(body, {
    headers: { "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}` },
  });
}

// Client errors are never cached, so a task that appears later is not shadowed by a stored 404.
export function botFail(message: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error: message, ...extra }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export interface TaskDoc {
  [key: string]: unknown;
}

// Slots left on a task. Mirrors the cap logic on the task page: an absent maxSubmissions means the default of 5.
// Reserved-but-unsubmitted claims are deliberately not counted, since a claim can lapse and the bot
// should not tell someone a task is full when it is about to free up.
function slotsRemaining(t: TaskDoc): number {
  const cap = (t.maxSubmissions as number) ?? DEFAULT_MAX_SUBMISSIONS;
  const used = (t.submissionCount as number) ?? 0;
  return Math.max(0, cap - used);
}

// Summary shape, for the list command. Enough to decide whether to open the task, nothing more.
export function taskSummary(id: string, t: TaskDoc, siteUrl: string) {
  return {
    id,
    number: t.number ?? null,
    title: t.title ?? null,
    category: t.category ?? null,
    status: t.status ?? null,
    cycle: t.cycle ?? null,
    shortDescription: t.shortDescription ?? null,
    reward: { usd: t.reward ?? null, rbnt: t.rewardRbnt ?? null, split: t.paymentSplit ?? null },
    submissions: {
      count: (t.submissionCount as number) ?? 0,
      cap: (t.maxSubmissions as number) ?? DEFAULT_MAX_SUBMISSIONS,
      slotsRemaining: slotsRemaining(t),
    },
    url: `${siteUrl}/tasks/${id}`,
  };
}

// Full shape, for the detail command. This is the whole published spec, which is exactly what a contributor
// sees on the task page, so a bot answer and the board never disagree about what the work is.
export function taskDetail(id: string, t: TaskDoc, siteUrl: string) {
  return {
    ...taskSummary(id, t, siteUrl),
    problem: t.problem ?? null,
    deliverables: (t.deliverables as string[]) ?? [],
    qualityBenchmarks: (t.qualityBenchmarks as string[]) ?? [],
    failureCriteria: (t.failureCriteria as string[]) ?? [],
    technicalRequirements: (t.technicalRequirements as string[]) ?? [],
    infrastructure: (t.infrastructure as string[]) ?? [],
    reviewerComp: t.reviewerComp ?? null,
  };
}

export function cycleSummary(cycle: Cycle | null, boardPaused: boolean, now = Date.now()) {
  const phase = cyclePhase(cycle, now);
  return {
    current: cycle?.current ?? null,
    phase,
    boardPaused,
    // A paused board still has a running cycle underneath, so the bot needs both flags to answer
    // "can I submit right now" correctly. Submissions need an unpaused board and a phase of open.
    acceptingSubmissions: !boardPaused && phase === "open",
    countdown: countdownLabel(cycle, now),
    dates: {
      openAt: cycle?.openAt ?? null,
      freezeAt: cycle?.freezeAt ?? null,
      closeAt: cycle?.closeAt ?? null,
      lastRevisionAt: cycle?.lastRevisionAt ?? null,
      payAt: cycle?.payAt ?? null,
    },
    daysUntil: {
      freeze: daysUntil(cycle?.freezeAt, now),
      close: daysUntil(cycle?.closeAt, now),
      pay: daysUntil(cycle?.payAt, now),
    },
  };
}

export function publicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://taskboard.redbellydao.network").replace(/\/$/, "");
}
