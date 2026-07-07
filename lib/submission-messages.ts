import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { notifyNewMessage } from "./notifications";

// Shared by SubmissionChat's manual send and the automatic system messages
// (reviewer starting a review, contributor resubmitting), so both paths write
// the same message shape and fire the same notification.
export async function sendSubmissionMessage(params: {
  submissionId: string;
  taskId?: string;
  taskTitle?: string;
  senderId: string;
  senderWallet: string;
  senderRole: string;
  message: string;
  contributorId?: string;
  reviewerId?: string;
}) {
  const { submissionId, taskId, taskTitle, senderId, senderWallet, senderRole, message, contributorId, reviewerId } = params;

  await addDoc(collection(db, "submissions", submissionId, "messages"), {
    senderId,
    senderWallet,
    senderRole,
    message,
    createdAt: serverTimestamp(),
  });

  if (taskId && taskTitle) {
    await notifyNewMessage({
      submissionId,
      taskId,
      taskTitle,
      senderId,
      senderWallet,
      senderRole,
      messagePreview: message,
      contributorId,
      reviewerId,
    }).catch(() => { /* non-blocking */ });
  }
}
