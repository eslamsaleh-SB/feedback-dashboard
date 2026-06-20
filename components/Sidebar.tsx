"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "Admin" | "Uploader" | "Viewer";
type Item = { href: string; label: string };

// Uploaders are shown as "Reviewers" in the UI (the DB role value stays Uploader).
const roleLabel = (role: Role) => (role === "Uploader" ? "Reviewer" : role);

export default function Sidebar({ email, role }: { email: string; role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const isViewer = role === "Viewer";

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Collectors get a single dashboard; Admins/Reviewers get analytics + tools.
  const items: Item[] = isViewer
    ? [{ href: "/analytics", label: "My Dashboard" }]
    : [
        { href: "/analytics", label: "Collectors Performance" },
        { href: "/match-totals", label: "Match Total per Module" },
        { href: "/feedback-reservation", label: "Feedback Reservation" },
        { href: "/feedback-progress", label: "Feedback Progress" },
        { href: "/upload", label: "Upload" },
        { href: "/module-upload", label: "Module Data" },
        ...(role === "Admin"
          ? [
              { href: "/collectors", label: "Collectors" },
              { href: "/accounts", label: "Accounts" },
            ]
          : []),
      ];

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white min-h-screen sticky top-0 flex flex-col">
      <div className="px-5 h-14 flex items-center font-bold text-lg border-b border-slate-100">
        🎬 Feedback
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const active =
            pathname === it.href || pathname?.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4 space-y-2">
        <div className="text-xs text-slate-500 truncate" title={email}>
          {email}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
            {roleLabel(role)}
          </span>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
