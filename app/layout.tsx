import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import SuspendedGate from "@/components/SuspendedGate";
import BoardPauseGate from "@/components/BoardPauseGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Web3Provider } from "@/components/Web3Provider";

// Be Vietnam Pro carries headings and body.
// JetBrains Mono carries the "technical" register: wallets, hashes, timestamps, numerics, status labels.
const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

// metadataBase resolves the relative image paths below; without it Next emits no absolute OG URL and the card renders bare.
// Set NEXT_PUBLIC_SITE_URL on the host so preview deploys advertise themselves rather than the production domain.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://taskboard.redbellydao.network";
const description = "Community Task Board: submit work, review deliverables, track progress.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Redbelly DAO Task Board",
  description,
  openGraph: {
    title: "Redbelly DAO Task Board",
    description,
    url: siteUrl,
    siteName: "Redbelly DAO Task Board",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Redbelly DAO Task Board" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Redbelly DAO Task Board",
    description,
    images: ["/og-image.png"],
  },
};

// Runs before first paint so the stored theme is applied without a flash of the wrong scheme.
// Dark is the default (DESIGN.md is a native dark system).
// suppressHydrationWarning on <html> covers the data-theme swap this makes before React hydrates.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem("taskboard-theme");
    document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${beVietnam.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <Web3Provider>
          <AuthProvider>
            <BoardPauseGate>
              <SuspendedGate>
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </SuspendedGate>
            </BoardPauseGate>
          </AuthProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
