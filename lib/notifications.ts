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

// Fired when a contributor files an appeal (rulebook 09). Admin broadcast only: no single reviewer/admin owns it yet.
export async function notifyAppealFiled({
  submissionId,
  taskId,
  taskTitle,
  senderWallet,
  senderRole,
  appealType,
}: {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  senderWallet: string;
  senderRole: string;
  appealType: string;
}) {
  await addDoc(collection(db, "notifications"), {
    type: "appeal_filed",
    submissionId,
    taskId,
    taskTitle,
    senderWallet,
    senderRole,
    messagePreview: `Appeal filed (${appealType === "rejection" ? "rejection" : "winner selection"})`,
    recipientId: null,
    forAdmins: true,
    readBy: [],
    createdAt: serverTimestamp(),
  }).catch(() => { /* non-blocking */ });
}

// Fired when admin decides an appeal. Personal notification to the contributor.
export async function notifyAppealDecided({
  submissionId,
  taskId,
  taskTitle,
  contributorId,
  adminWallet,
  outcome,
}: {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  contributorId: string;
  adminWallet?: string;
  outcome: "upheld" | "overturned";
}) {
  await addDoc(collection(db, "notifications"), {
    type: "appeal_decided",
    submissionId,
    taskId,
    taskTitle,
    senderWallet: adminWallet ?? "",
    senderRole: "admin",
    messagePreview: outcome === "overturned" ? "Your appeal was overturned" : "Your appeal was upheld: decision stands",
    recipientId: contributorId,
    read: false,
    createdAt: serverTimestamp(),
  }).catch(() => { /* non-blocking */ });
}
