"use client";
import { displayName, getSubmissionStatusLabel, RUBRIC_CRITERIA } from "@/lib/tasks";

// Read-only rubric (reviewer viewing a completed review, or inside admin view mode).
export function ReadOnlyRubric({ sub }: { sub: any }) {
  return (
    <>
      <div className="mb-4 text-xs space-y-1">
        {sub.reviewerWallet && (
          <div><span className="text-outline">Reviewed by: </span><span className="font-semibold text-on-surface">{displayName(sub.reviewerName, undefined, sub.reviewerWallet)}</span></div>
        )}
        <div>
          <span className="text-outline">Decision: </span>
          <span className={`badge-${sub.status} ml-1`}>{getSubmissionStatusLabel(sub.status)}</span>
        </div>
        {sub.reviewTotalScore != null && (
          <div><span className="text-outline">Score: </span><span className="font-bold text-primary">{sub.reviewTotalScore}/35</span></div>
        )}
      </div>
      <div className="space-y-4">
        {RUBRIC_CRITERIA.map((criterion, i) => (
          <div key={i} className="p-4 bg-surface-container-low rounded text-xs">
            <p className="font-semibold text-on-surface mb-1">{criterion}</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-primary text-base">{sub.reviewScores?.[i] ?? "-"}/5</span>
              <span className="text-on-surface">{sub.reviewJustifications?.[i] || "No justification provided."}</span>
            </div>
          </div>
        ))}
      </div>
      {sub.requiredChanges && (
        <div className="mt-4 p-3 bg-yellow-50 rounded">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Required Changes</p>
          <p className="text-xs text-warn whitespace-pre-line">{sub.requiredChanges}</p>
        </div>
      )}
      {sub.adminOverride && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Override Applied</p>
          <p className="text-xs text-warn">{sub.adminOverrideFeedback}</p>
        </div>
      )}
    </>
  );
}
