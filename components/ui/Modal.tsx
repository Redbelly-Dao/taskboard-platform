"use client";
import { useEffect } from "react";

// Centered dialog on a scrim. Dismissable by scrim-click and Escape on every viewport
// (the old hand-rolled dialogs trapped mobile users because their click-away scrim collapsed to zero width).
// Body scroll locks while open.
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
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

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`glass rounded w-full ${width} max-h-[calc(100vh-2rem)] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 -mr-1 text-outline hover:text-primary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className={title ? "px-6 pb-2" : "p-6"}>{children}</div>
        {footer && <div className="px-6 py-4 mt-2 border-t border-surface-container-high flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
