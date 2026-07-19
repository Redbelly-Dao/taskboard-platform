"use client";
import { useEffect, useRef, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { displayName } from "@/lib/tasks";
import { sendSubmissionMessage } from "@/lib/submission-messages";

interface Props {
  submissionId: string;
  taskId?: string;
  taskTitle?: string;
  contributorId?: string;
  reviewerId?: string;
}

export default function SubmissionChat({ submissionId, taskId, taskTitle, contributorId, reviewerId }: Props) {
  const { user, appUser } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "submissions", submissionId, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [submissionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || !user || !appUser) return;
    setSending(true);
    const msgText = text.trim();
    try {
      await sendSubmissionMessage({
        submissionId,
        taskId,
        taskTitle,
        senderId: user.uid,
        senderWallet: appUser.walletAddress,
        senderName: appUser.username || appUser.discordHandle || undefined,
        senderRole: appUser.role,
        message: msgText,
        contributorId,
        reviewerId,
      });
      setText("");
    } finally {
      setSending(false);
    }
  };

  const roleColor = (role: string) =>
    role === "admin" ? "text-primary" : role === "reviewer" ? "text-blue-600" : "text-outline";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-outline mb-3">Discussion</p>

      <div className="border border-surface-container-high rounded-lg overflow-hidden">
        <div className="max-h-52 overflow-y-auto p-3 space-y-2 bg-surface-container-lowest">
          {messages.length === 0 && (
            <p className="text-xs text-outline text-center py-4">No messages yet. Start the conversation.</p>
          )}
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                  isMe ? "bg-brand text-white" : "bg-surface-container-low text-on-surface"
                }`}>
                  {!isMe && (
                    <p className={`text-[10px] font-bold mb-0.5 ${roleColor(msg.senderRole)}`}>
                      {displayName(msg.senderName, undefined, msg.senderWallet)}
                      <span className="font-normal text-outline ml-1 capitalize">({msg.senderRole})</span>
                    </p>
                  )}
                  <p className="leading-relaxed break-words">{msg.message}</p>
                  <p className={`text-[10px] mt-0.5 ${isMe ? "text-white/60" : "text-outline"}`}>
                    {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 p-2 border-t border-surface-container-high bg-surface-container-low">
          <input
            className="input flex-1 text-xs py-1.5"
            placeholder="Send a message... (Enter to send)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            maxLength={500}
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
