"use client";
import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import Modal from "@/components/ui/Modal";

// Propose a new task for the board. Tracked in the admin Task Suggestions tab.
export default function TaskSuggestionModal({ onClose }: { onClose: () => void }) {
  const { appUser } = useAuth();
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!title.trim() || !rationale.trim() || !appUser) return;
    setSending(true);
    try {
      await addDoc(collection(db, "taskSuggestions"), {
        from: appUser.walletAddress,
        username: appUser.username || null,
        title: title.trim(),
        rationale: rationale.trim(),
        link: link.trim() || null,
        status: "new",
        createdAt: serverTimestamp(),
      });
      setSent(true);
      setTimeout(onClose, 1200);
    } catch {
      setSending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Suggest a task">
      {sent ? (
        <p className="text-sm text-on-surface text-center py-4">Thanks. Your suggestion was submitted.</p>
      ) : (
        <>
          <p className="text-xs text-outline mb-4">Propose a new task for the board. Admins review suggestions and may turn them into live tasks.</p>

          <label className="label" htmlFor="suggest-title">Task title</label>
          <input
            id="suggest-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input mb-3"
            placeholder="Short, descriptive name for the task"
            maxLength={120}
            autoFocus
          />

          <label className="label" htmlFor="suggest-why">Why it matters</label>
          <textarea
            id="suggest-why"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={4}
            className="input resize-none mb-3"
            placeholder="What problem does it solve, and what should the deliverable be?"
            maxLength={1000}
          />

          <label className="label" htmlFor="suggest-link">Reference link <span className="text-outline font-normal normal-case">(optional)</span></label>
          <input
            id="suggest-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input"
            placeholder="https://…"
          />

          <div className="flex justify-end gap-2 mt-4 mb-2">
            <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
            <button onClick={send} disabled={!title.trim() || !rationale.trim() || sending} className="btn-primary text-xs">
              {sending ? "Submitting…" : "Submit suggestion"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
