import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Cycle } from "@/lib/cycle";
import { authorizeBot, botError, botJson, cycleSummary } from "@/lib/bot-api";

export const dynamic = "force-dynamic";

// Cycle state for the bot: which cycle is running, the dates, the countdown, and whether submissions are open.
export async function GET(req: NextRequest) {
  const denied = authorizeBot(req);
  if (denied) return denied;

  try {
    const db = getAdminFirestore();
    const [cycleSnap, boardSnap] = await Promise.all([
      db.collection("config").doc("cycle").get(),
      db.collection("config").doc("board").get(),
    ]);

    const cycle = (cycleSnap.data() as Cycle) ?? null;
    const board = boardSnap.data() ?? {};

    return botJson({ cycle: cycleSummary(cycle, board.paused === true) });
  } catch (err) {
    return botError(err, "bot/cycle");
  }
}
