"use client";
import Navbar from "@/components/Navbar";

// Every page used to hand-repeat the page chrome.
// One shell now owns it: deep background, the nav, and the 1280px fixed-fluid container
// with a 16px mobile gutter (DESIGN.md, Layout & Spacing).
const WIDTHS = {
  page: "max-w-[1280px]",
  narrow: "max-w-3xl",
  form: "max-w-md",
} as const;

export default function AppShell({
  children,
  width = "page",
  nav = true,
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTHS;
  nav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background-deep">
      {nav && <Navbar />}
      <div className={`${WIDTHS[width]} mx-auto px-4 sm:px-6 py-8`}>{children}</div>
    </div>
  );
}

// Shared page title block, so headings stay on one type scale.
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">{title}</h1>
        {subtitle && <p className="text-outline text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
