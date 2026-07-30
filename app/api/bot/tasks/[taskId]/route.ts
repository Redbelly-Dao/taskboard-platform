import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { authorizeBot, botError, botFail, botJson, publicSiteUrl, taskDetail } from "@/lib/bot-api";

export const dynamic = "force-dynamic";

// One task's full published spec. The document id is the task code, so /api/bot/tasks/TASK-16 is the natural lookup.
export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const denied = authorizeBot(req);
  if (denied) return denied;

  try {
    const { taskId } = await params;
    // Task codes are stored uppercase. Accepting a lowercase code means the bot does not have to care about how someone typed it.
    const id = taskId.trim().toUpperCase();

    const snap = await getAdminFirestore().collection("tasks").doc(id).get();
    if (!snap.exists) {
      return botFail("Task not found", 404, { id });
    }

    return botJson({ task: taskDetail(snap.id, snap.data()!, publicSiteUrl()) });
  } catch (err) {
    return botError(err, "bot/tasks/[taskId]");
  }
}
