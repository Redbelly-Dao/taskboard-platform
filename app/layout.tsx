import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import SuspendedGate from "@/components/SuspendedGate";

export const metadata: Metadata = {
  title: "Redbelly DAO Task Board",
  description: "Community Task Board: submit work, review deliverables, track progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AuthProvider><SuspendedGate>{children}</SuspendedGate></AuthProvider>
      </body>
    </html>
  );
}
