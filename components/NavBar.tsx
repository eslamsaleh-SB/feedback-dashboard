"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavBar({
  email,
  role,
}: {
  email: string;
  role: "Admin" | "Uploader" | "Viewer";
}) {
  const router = useRouter();
  const supabase = createClient();
  const isViewer = role === "Viewer";
  const canUpload = role === "Admin" || role === "Uploader";

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const link = "text-sm text-slate-600 hover:text-slate-900";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-6">
          <Link href={isViewer ? "/analytics" : "/dashboard"} className="font-bold">
            🎬 Feedback
          </Link>

          {isViewer ? (
            // Collector experience: a single dashboard, nothing admin-related.
            <Link href="/analytics" className={link}>
              My Dashboard
            </Link>
          ) : (
            <>
              <Link href="/dashboard" className={link}>
                Dashboard
              </Link>
              <Link href="/analytics" className={link}>
                Collectors Performance
              </Link>
              {canUpload && (
                <Link href="/upload" className={link}>
                  Upload
                </Link>
              )}
              {canUpload && (
                <Link href="/module-upload" className={link}>
                  Module Data
                </Link>
              )}
              {role === "Admin" && (
                <Link href="/collectors" className={link}>
                  Collectors
                </Link>
              )}
              {role === "Admin" && (
                <Link href="/accounts" className={link}>
                  Accounts
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-slate-500">{email}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
            {role}
          </span>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
