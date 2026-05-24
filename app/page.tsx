"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (appUser?.role === "admin") router.replace("/admin");
    else if (appUser?.role === "reviewer") router.replace("/reviewer");
    else router.replace("/dashboard");
  }, [user, appUser, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#555555]">Loading...</p>
      </div>
    </div>
  );
}
