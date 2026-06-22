"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type AppRole =
  | "Admin"
  | "Uploader"
  | "Viewer"
  | "TeamLeader"
  | "Supervisor"
  | "QualityLeader";

type Item = { href: string; label: string };

const roleLabel = (role: AppRole): string => {
  const map: Record<AppRole, string> = {
    Admin: "Admin",
    Uploader: "Reviewer",
    Viewer: "Collector",
    TeamLeader: "Team Leader",
    Supervisor: "Supervisor",
    QualityLeader: "Quality Leader",
  };
  return map[role] ?? role;
};

function navItems(role: AppRole): Item[] {
  if (role === "Viewer") {
    return [
      { href: "/analytics", label: "My Dashboard" },
      { href: "/reports-sessions", label: "Reports & Sessions" },
      { href: "/quality-score", label: "Quality Score" },
    ];
  }

  const base: Item[] = [
    { href: "/analytics", label: "Collectors Performance" },
    { href: "/match-totals", label: "Match Total per Module" },
  ];

  const canSeeFeedback =
    role === "Admin" || role === "Uploader" || role === "Supervisor";
  if (canSeeFeedback) {
    base.push(
      { href: "/feedback-reservation", label: "Feedback Reservation" },
      { href: "/feedback-progress", label: "Feedback Progress" }
    );
  }

  if (role === "Admin" || role === "Uploader") {
    base.push(
      { href: "/upload", label: "Report" },
      { href: "/module-upload", label: "Module Data" }
    );
  }

  if (role === "Admin" || role === "QualityLeader") {
    base.push({ href: "/quality-upload", label: "Quality Score Upload" });
  }

  base.push({ href: "/quality-score", label: "Quality Score" });

  if (role === "Admin") {
    base.push(
      { href: "/admin-reports", label: "Admin Reports & Sessions" },
      { href: "/report-monitoring", label: "Unacknowledged Reports" },
      { href: "/collectors", label: "Collectors" },
      { href: "/accounts", label: "Accounts" }
    );
  }

  return base;
}

export default function Sidebar({
  email,
  role,
}: {
  email: string;
  role: AppRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const items = navItems(role);

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-slate-100 flex flex-col items-center text-center gap-2">
        <img src="/Logo/logo.png" alt="Hudl" className="h-8 w-auto max-w-full" />
        <span className="text-sm font-semibold text-slate-700 leading-tight">
          Collector Performance Dashboard
        </span>
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
