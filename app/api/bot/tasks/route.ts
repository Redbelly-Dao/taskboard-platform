import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Cycle } from "@/lib/cycle";
import { authorizeBot, botError, botFail, botJson, cycleSummary, publicSiteUrl, taskSummary } from "@/lib/bot-api";

export const dynamic = "force-dynamic";

// Task list for the bot. Defaults to open tasks in the current cycle, which is what a "what can I work on" command wants.
// ?status=all and ?cycle=<n> widen it for the rarer questions without needing separate endpoints.
export async function GET(req: NextRequest) {
  const denied = authorizeBot(req);
  if (denied) return denied;

  try {
    const db = getAdminFirestore();
    const [cycleSnap, boardSnap] = await Promise.all([
      db.collection("config").doc("cycle").get(),
      db.collection("config").doc("board").get(),
    ]);

    const cycleCfg = (cycleSnap.data() as Cycle) ?? null;
    const board = boardSnap.data() ?? {};

    const params = req.nextUrl.searchParams;
    const statusParam = params.get("status") || "open";
    const cycleParam = params.get("cycle");

    const requestedCycle = cycleParam === "all" ? null : Number(cycleParam ?? cycleCfg?.current ?? 0);
    if (requestedCycle !== null && !Number.isFinite(requestedCycle)) {
      return botFail("cycle must be a number or 'all'", 400);
    }

    // Filtering by cycle happens in the query since that is the indexed field.
    // Status is filtered in memory so status=all costs no extra composite index.
    let query = db.collection("tasks").limit(200) as FirebaseFirestore.Query;
    if (requestedCycle !== null) query = query.where("cycle", "==", requestedCycle);

    const snap = await query.get();
    const siteUrl = publicSiteUrl();

    const tasks = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter(({ data }) => statusParam === "all" || data.status === statusParam)
      .map(({ id, data }) => taskSummary(id, data, siteUrl))
      .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

    return botJson({
      cycle: cycleSummary(cycleCfg, board.paused === true),
      filter: { status: statusParam, cycle: requestedCycle ?? "all" },
      count: tasks.length,
      tasks,
    });
  } catch (err) {
    return botError(err, "bot/tasks");
  }
}
