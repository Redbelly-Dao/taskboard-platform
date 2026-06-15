import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function notifyNewMessage({
  submissionId,
  taskId,
  taskTitle,
  senderId,
  senderWallet,
  senderRole,
  messagePreview,
  contributorId,
  reviewerId,
}: {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  senderId: string;
  senderWallet: string;
  senderRole: string;
  messagePreview: string;
  contributorId?: string;
  reviewerId?: string;
}) {
  const base = {
    type: "new_message",
    submissionId,
    taskId,
    taskTitle,
    senderWallet,
    senderRole,
    messagePreview: messagePreview.slice(0, 120),
    createdAt: serverTimestamp(),
  };

  const ops: Promise<any>[] = [];

  if (senderRole === "contributor") {
    if (reviewerId && reviewerId !== senderId) {
      ops.push(addDoc(collection(db, "notifications"), {
        ...base,
        recipientId: reviewerId,
        forAdmins: false,
        read: false,
      }));
    }
    ops.push(addDoc(collection(db, "notifications"), {
      ...base,
      recipientId: null,
      forAdmins: true,
      readBy: [],
    }));
  } else if (senderRole === "reviewer") {
    if (contributorId && contributorId !== senderId) {
      ops.push(addDoc(collection(db, "notifications"), {
        ...base,
        recipientId: contributorId,
        forAdmins: false,
        read: false,
      }));
    }
    ops.push(addDoc(collection(db, "notifications"), {
      ...base,
      recipientId: null,
      forAdmins: true,
      readBy: [],
    }));
  } else if (senderRole === "admin") {
    if (contributorId && contributorId !== senderId) {
      ops.push(addDoc(collection(db, "notifications"), {
        ...base,
        recipientId: contributorId,
        forAdmins: false,
        read: false,
      }));
    }
    if (reviewerId && reviewerId !== senderId) {
      ops.push(addDoc(collection(db, "notifications"), {
        ...base,
        recipientId: reviewerId,
        forAdmins: false,
        read: false,
      }));
    }
  }

  if (ops.length > 0) {
    await Promise.all(ops).catch(() => { /* non-blocking */ });
  }
}
