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

export const metadata: Metadata = {
  title: "Redbelly DAO Task Board",
  description: "Community Task Board: submit work, review deliverables, track progress.",
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
