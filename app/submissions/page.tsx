"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function SubmissionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "submissions"), where("contributorId", "==", user.uid));
    getDocs(q).then((snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setSubmissions(sorted);
      setSubLoading(false);
    });
  }, [user]);

  if (loading || subLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">My Submissions</h1>
          <p className="text-[#888888] text-sm mt-1">
            {submissions.length} submission{submissions.length !== 1 ? "s" : ""} total
          </p>
        </div>

        {submissions.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[#555555] text-sm mb-3">You have not submitted any work yet.</p>
            <Link href="/dashboard" className="text-[#E63329] text-sm font-semibold hover:underline">
              Browse open tasks →
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-white" style={{ backgroundColor: "#2C2C2C" }}>
                  <th className="text-left px-4 py-3 font-semibold">Task</th>
                  <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Score</th>
                  <th className="text-left px-4 py-3 font-semibold">Reviewed by</th>
                  <th className="text-left px-4 py-3 font-semibold">Links</th>
                  <th className="text-left px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub, i) => (
                  <tr key={sub.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</p>
                      <p className="text-xs text-[#888888] truncate max-w-[200px]">{sub.taskTitle}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#888888]">
                      {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`badge-${sub.status}`}>{sub.status.replace(/_/g, " ")}</span>
                        {sub.adminOverride && (
                          <span className="badge bg-yellow-50 text-yellow-700">admin reviewed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {sub.reviewTotalScore
                        ? <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span>
                        : <span className="text-[#AAAAAA]">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-[#888888]">
                      {sub.reviewerWallet
                        ? `${sub.reviewerWallet.slice(0, 6)}...${sub.reviewerWallet.slice(-4)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        {sub.githubLink && (
                          <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#E63329] font-semibold hover:underline">GitHub</a>
                        )}
                        {sub.liveLink && (
                          <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#E63329] font-semibold hover:underline">Live</a>
                        )}
                        {sub.fileUrl && (
                          <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#E63329] font-semibold hover:underline">File</a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${sub.taskId}`} className="text-xs text-[#E63329] font-semibold hover:underline whitespace-nowrap">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
