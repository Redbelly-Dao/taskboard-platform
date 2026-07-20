import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { UTApi } from "uploadthing/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";

// Resolving a bug report permanently deletes its uploaded images to free storage, but the
// feedback message itself stays. Deletion happens here (admin SDK + UploadThing secret) so it
// can't be triggered from the client.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const firestore = getAdminFirestore();

    let uid: string;
    try {
      uid = (await auth.verifyIdToken(token)).uid;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userSnap = await firestore.collection("users").doc(uid).get();
    if (userSnap.data()?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { feedbackId } = await req.json();
    if (!feedbackId || typeof feedbackId !== "string") {
      return NextResponse.json({ error: "Missing feedbackId" }, { status: 400 });
    }

    const feedbackRef = firestore.collection("feedback").doc(feedbackId);
    const feedbackSnap = await feedbackRef.get();
    if (!feedbackSnap.exists) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const feedback = feedbackSnap.data()!;
    if (feedback.status === "resolved") {
      return NextResponse.json({ success: true, alreadyResolved: true });
    }

    const attachments: { url?: string; key?: string; name?: string; size?: number }[] = feedback.attachments || [];
    const keys = attachments.map((a) => a.key).filter((k): k is string => !!k);

    if (keys.length) {
      // Best-effort: files already removed (or never fully uploaded) shouldn't block resolving.
      await new UTApi().deleteFiles(keys).catch(() => {});
    }

    const purgedAttachments = attachments.map((a) => ({ name: a.name ?? "", size: a.size ?? 0 }));

    await feedbackRef.update({
      status: "resolved",
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      attachments: admin.firestore.FieldValue.delete(),
      purgedAttachments,
      purgedAttachmentCount: purgedAttachments.length,
    });

    return NextResponse.json({ success: true, purgedAttachmentCount: purgedAttachments.length });
  } catch (err: unknown) {
    console.error("feedback/resolve error:", err);
    const isDev = process.env.NODE_ENV === "development";
    const msg = (err as Error)?.message || "Internal error";
    return NextResponse.json({ error: isDev ? msg : "Internal error" }, { status: 500 });
  }
}
