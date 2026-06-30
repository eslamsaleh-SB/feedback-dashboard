"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AppRole =
  | "Admin"
  | "Uploader"
  | "Viewer"
  | "TeamLeader"
  | "Supervisor"
  | "QualityLeader";

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

type NavItem = { href: string; label: string };
type NavEntry =
  | { type: "link"; href: string; label: string }
  | { type: "group"; key: string; label: string; items: NavItem[] };

function buildNav(role: AppRole): NavEntry[] {
  if (role === "Viewer") {
    return [
      { type: "link", href: "/analytics", label: "Home" },
      { type: "link", href: "/my-reports", label: "My Reports" },
      { type: "link", href: "/my-sessions", label: "My Sessions" },
      { type: "link", href: "/my-matches", label: "My Match Details" },
      { type: "link", href: "/my-inquiries", label: "Ask a Question" },
      { type: "link", href: "/quality-score", label: "Quality Score" },
    ];
  }

  const entries: NavEntry[] = [
    { type: "link", href: "/dashboard", label: "Home" },
    {
      type: "group",
      key: "performance",
      label: "Performance",
      items: [
        { href: "/analytics", label: "Collectors Performance" },
        { href: "/match-totals", label: "Match Total Per Module" },
        { href: "/quality-score", label: "Quality Score" },
        { href: "/performance-thresholds", label: "Performance Thresholds" },
      ],
    },
  ];

  const uploadItems: NavItem[] = [];
  if (role === "Admin" || role === "Uploader") {
    uploadItems.push({ href: "/module-upload", label: "Module Data" });
  }
  if (role === "Admin" || role === "QualityLeader") {
    uploadItems.push({ href: "/quality-upload", label: "Quality Score Upload" });
  }
  if (role === "Admin" || role === "Uploader") {
    uploadItems.push({ href: "/upload", label: "Send Report" });
  }
  if (uploadItems.length > 0) {
    entries.push({ type: "group", key: "upload", label: "Upload Data", items: uploadItems });
  }

  if (role === "Admin" || role === "Uploader" || role === "Supervisor") {
    const feedbackItems: NavItem[] = [];
    if (role !== "Admin") {
      feedbackItems.push({ href: "/feedback-progress", label: "Feedback Progress" });
    }
    feedbackItems.push({ href: "/feedback-reservation", label: "Feedback Reservations" });
    entries.push({
      type: "group",
      key: "feedback",
      label: "Feedback",
      items: feedbackItems,
    });
  }

  if (role === "Admin") {
    entries.push({
      type: "group",
      key: "admin",
      label: "Administration",
      items: [
        { href: "/admin-reports", label: "Reports" },
        { href: "/admin-inquiries", label: "Inquiries" },
        { href: "/feedback-progress", label: "Feedback Progress" },
        { href: "/users", label: "Users" },
      ],
    });
  }

  return entries;
}

function groupContainsPath(items: NavItem[], pathname: string): boolean {
  return items.some((it) => pathname === it.href || pathname?.startsWith(it.href + "/"));
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
  const navEntries = buildNav(role);

  const initialOpen = new Set<string>();
  for (const entry of navEntries) {
    if (entry.type === "group" && groupContainsPath(entry.items, pathname ?? "")) {
      initialOpen.add(entry.key);
    }
  }
  const [openGroups, setOpenGroups] = useState<Set<string>>(initialOpen);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-slate-100 flex flex-col items-center text-center gap-2">
        <img src="/Logo/logo.png" alt="Hudl" className="h-8 w-auto max-w-full" />
        <span className="text-sm font-semibold text-slate-700 leading-tight">
          Collector Performance Dashboard
        </span>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navEntries.map((entry) => {
          if (entry.type === "link") {
            const active = pathname === entry.href || pathname?.startsWith(entry.href + "/");
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {entry.label}
              </Link>
            );
          }

          const isOpen = openGroups.has(entry.key);
          const groupActive = groupContainsPath(entry.items, pathname ?? "");

          return (
            <div key={entry.key}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs uppercase font-semibold tracking-wider transition ${
                  groupActive && !isOpen ? "text-slate-900 bg-slate-100" : "text-slate-400 hover:bg-slate-50"
                }`}
              >
                <span>{entry.label}</span>
                <span className="text-slate-400 ml-1">{isOpen ? "▼" : "▶"}</span>
              </button>
              {isOpen && (
                <div className="mt-1 space-y-0.5 pl-3">
                  {entry.items.map((item) => {
                    const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                          active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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
