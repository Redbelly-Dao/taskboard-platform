import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import SuspendedGate from "@/components/SuspendedGate";
import BoardPauseGate from "@/components/BoardPauseGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Web3Provider } from "@/components/Web3Provider";

export const metadata: Metadata = {
  title: "Redbelly DAO Task Board",
  description: "Community Task Board: submit work, review deliverables, track progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
