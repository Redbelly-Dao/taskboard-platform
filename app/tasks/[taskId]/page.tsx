"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { useUploadThing } from "@/lib/uploadthing";
import { TASKS, getCategoryLabel } from "@/lib/tasks";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  const task = TASKS.find((t) => t.id === taskId);
  const [existingSub, setExistingSub] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  // Submission form state
  const [githubLink, setGithubLink] = useState("");
  const [liveLink, setLiveLink] = useState("");
  const [publishedLink, setPublishedLink] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing("submissionFile", {
    onUploadProgress: setUploadProgress,
  });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !taskId) return;
    const fetchSub = async () => {
      const q = query(
        collection(db, "submissions"),
        where("contributorId", "==", user.uid)
      );
      const snap = await getDocs(q);
      const match = snap.docs.find((d) => d.data().taskId === taskId);
      if (match) setExistingSub({ id: match.id, ...match.data() });
    };
    fetchSub();
  }, [user, taskId]);

  if (!task) return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-[#555555]">Task not found.</p>
        <Link href="/dashboard" className="text-[#E63329] text-sm font-semibold mt-4 inline-block">
          Back to dashboard
        </Link>
      </div>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !appUser) {
      setSubmitError("Your profile failed to load from the database. Sign out and sign back in, then try again.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);

    try {
      let fileUrl = "";
      let fileName = "";

      if (file) {
        const res = await startUpload([file]);
        if (!res?.[0]) throw new Error("Upload failed — no response from UploadThing");
        fileUrl = res[0].ufsUrl;
        fileName = file.name;
      }

      await addDoc(collection(db, "submissions"), {
        taskId,
        taskTitle: task.title,
        contributorId: user.uid,
        walletAddress: appUser.walletAddress,
        discordHandle: appUser.discordHandle || "",
        githubLink,
        liveLink,
        publishedLink,
        notes,
        fileUrl,
        fileName,
        status: "under_review",
        reviewScore: null,
        reviewDecision: null,
        reviewFeedback: null,
        reviewerId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace("/dashboard");
    } catch (err) {
      setSubmitError("Submission failed. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/dashboard" className="text-[#555555] text-sm hover:text-[#E63329] mb-6 inline-flex items-center gap-1">
          ← Back to dashboard
        </Link>

        {/* Task header */}
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-mono text-[#AAAAAA]">{task.id}</span>
            <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
            <span className={`badge-${task.status}`}>{task.status}</span>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">{task.title}</h1>
          <p className="text-sm text-[#555555] leading-relaxed mb-4">{task.shortDescription}</p>

          <div className="flex items-center gap-6 pt-4 border-t border-[#E8EBF0]">
            <div>
              <p className="text-xs text-[#AAAAAA]">Contributor Reward</p>
              <p className="text-xl font-bold text-[#E63329]">${task.reward} <span className="text-sm font-normal text-[#555555]">{task.paymentSplit}</span></p>
            </div>
            <div>
              <p className="text-xs text-[#AAAAAA]">Reviewer Comp</p>
              <p className="text-base font-bold text-[#1A1A2E]">{task.reviewerComp > 0 ? `$${task.reviewerComp}` : "N/A"}</p>
            </div>
          </div>
        </div>

        {/* Problem */}
        <div className="card p-6 mb-4">
          <h2 className="font-bold text-[#1A1A2E] mb-2">Problem Statement</h2>
          <p className="text-sm text-[#555555] leading-relaxed">{task.problem}</p>
        </div>

        {/* Deliverables */}
        <div className="card p-6 mb-4">
          <h2 className="font-bold text-[#1A1A2E] mb-3">Required Deliverables</h2>
          <ol className="space-y-2">
            {task.deliverables.map((d, i) => (
              <li key={i} className="flex gap-3 text-sm text-[#555555]">
                <span className="text-[#E63329] font-bold shrink-0">{i + 1}.</span>
                <span className="leading-relaxed">{d}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Quality benchmarks */}
        <div className="card p-6 mb-4">
          <h2 className="font-bold text-[#1A1A2E] mb-3">Quality Benchmarks</h2>
          <ul className="space-y-2">
            {task.qualityBenchmarks.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-[#555555]">
                <span className="text-[#E63329] font-bold shrink-0">✓</span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Failure criteria */}
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-[#1A1A2E] mb-3">Failure Criteria</h2>
          <ul className="space-y-2">
            {task.failureCriteria.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-[#555555]">
                <span className="text-red-500 font-bold shrink-0">✕</span>
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Submission section */}
        {existingSub ? (
          <div className="card p-6 border-l-4 border-l-[#E63329]">
            <h2 className="font-bold text-[#1A1A2E] mb-2">Your Submission</h2>
            <div className="flex items-center gap-2 mb-3">
              <span className={`badge-${existingSub.status}`}>{existingSub.status.replace("_", " ")}</span>
              <span className="text-xs text-[#AAAAAA]">
                Submitted {existingSub.createdAt?.toDate?.()?.toLocaleDateString()}
              </span>
            </div>
            {existingSub.reviewDecision && (
              <div className={`rounded p-3 mt-3 ${existingSub.reviewDecision === "approved" ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}>
                <p className="text-xs font-semibold mb-1 capitalize">{existingSub.reviewDecision}</p>
                {existingSub.reviewFeedback && (
                  <p className="text-xs text-[#555555]">{existingSub.reviewFeedback}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1A1A2E]">Submit Your Deliverable</h2>
              {!showForm && (
                <button onClick={() => setShowForm(true)} className="btn-primary">
                  Start Submission
                </button>
              )}
            </div>

            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-[#FEF0EF] rounded p-3 mb-4">
                  <p className="text-xs text-[#E63329] font-semibold mb-1">Before you submit</p>
                  <p className="text-xs text-[#555555]">
                    Make sure your submission meets every quality benchmark and avoids every failure criterion listed above.
                    Submissions that are clearly incomplete will be returned without review credit.
                  </p>
                </div>

                <div>
                  <label className="label">GitHub Repository Link</label>
                  <input className="input" type="url" placeholder="https://github.com/..." value={githubLink} onChange={(e) => setGithubLink(e.target.value)} />
                </div>

                <div>
                  <label className="label">Live URL <span className="text-[#AAAAAA] font-normal normal-case">(deployed app, published article, Figma file, etc.)</span></label>
                  <input className="input" type="url" placeholder="https://..." value={liveLink} onChange={(e) => setLiveLink(e.target.value)} />
                </div>

                <div>
                  <label className="label">Published Article or Documentation Link</label>
                  <input className="input" type="url" placeholder="https://dev.to/ or https://medium.com/..." value={publishedLink} onChange={(e) => setPublishedLink(e.target.value)} />
                </div>

                <div>
                  <label className="label">File Upload <span className="text-[#AAAAAA] font-normal normal-case">(PDF, ZIP, etc. — max 50MB)</span></label>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.zip,.docx,.md,.mp4,.fig"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-[#E5E5E5] hover:border-[#E63329] rounded p-6 text-center cursor-pointer transition-colors"
                  >
                    {file ? (
                      <p className="text-sm text-[#1A1A2E] font-semibold">{file.name}</p>
                    ) : (
                      <p className="text-sm text-[#AAAAAA]">Click to upload a file</p>
                    )}
                  </div>
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-2 bg-[#F0F2F5] rounded h-1.5">
                      <div className="bg-[#E63329] h-1.5 rounded transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Notes for Reviewer</label>
                  <textarea
                    className="input resize-none"
                    rows={4}
                    placeholder="Any design decisions, known limitations, or context the reviewer should know..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                  />
                  <p className="text-xs text-[#AAAAAA] mt-1">{notes.length}/1000 characters</p>
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-red-700 text-xs">{submitError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary" disabled={submitting || isUploading}>
                    {isUploading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Uploading file... {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : ""}
                      </span>
                    ) : submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Submitting...
                      </span>
                    ) : "Submit for Review"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
