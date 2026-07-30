import Link from "next/link";

// The rulebook, the terms and the brand kit are all things contributors are held to and none of them
// were reachable without knowing the URL. This is the one place every page links them from.
// Deliberately quiet: it sits under the content, not in the nav, so it never competes with the task flow.
export default function SiteFooter() {
  return (
    <footer className="border-t border-outline-variant mt-auto">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/terms" className="text-xs text-outline hover:text-primary transition-colors">T&amp;Cs</Link>
        <span className="text-xs text-outline-variant" aria-hidden="true">|</span>
        <Link href="/rules" className="text-xs text-outline hover:text-primary transition-colors">Rules</Link>
        <span className="text-xs text-outline-variant" aria-hidden="true">|</span>
        {/* Static page served from public/, so a plain anchor rather than a Link. */}
        <a href="/brand" className="text-xs text-outline hover:text-primary transition-colors">Brand kit</a>
        <span className="mono text-[10px] text-outline-variant ml-auto uppercase tracking-widest">Redbelly DAO Task Board</span>
      </div>
    </footer>
  );
}
