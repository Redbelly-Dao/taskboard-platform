"use client";
import { useEffect } from "react";

// Right-side sheet for detail/edit panels. The scrim is an explicit sibling with its own flex-1 width,
// so tap-to-dismiss works at every viewport
// (the old admin drawers used a scrim that collapsed below 672px, trapping mobile users).
export default function Drawer({
  open,
  onClose,
  title,
  children,
  width = "lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const w = width === "md" ? "sm:max-w-lg" : "sm:max-w-2xl";

  return (
    <div className="fixed inset-0 z-[120] flex" role="dialog" aria-modal="true">
      <button className="flex-1 bg-black/60" onClick={onClose} aria-label="Close panel" />
      <div className={`glass w-full ${w} h-full flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex-none px-5 flex items-center justify-between card-rule">
          <div className="min-w-0 text-on-surface font-semibold text-sm truncate">{title}</div>
          <button onClick={onClose} aria-label="Close" className="p-1 -mr-1 text-outline hover:text-primary flex-none">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
