import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";

export const dynamic = "force-dynamic";

export default async function MyPresentationsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Viewer") redirect("/admin-presentations");

  // RLS scopes presentations to those assigned to the current collector.
  // v59: try SELECT with assigned_date; fall back to legacy shape if the DB
  // migration (sql/04) hasn't been applied yet.
  let rows: any[] | null = null;
  const withDate = await supabase
    .from("presentations")
    .select("id, title, description, assigned_date, created_at, presentation_pages(count)")
    .order("created_at", { ascending: false });
  if (withDate.error) {
    const legacy = await supabase
      .from("presentations")
      .select("id, title, description, created_at, presentation_pages(count)")
      .order("created_at", { ascending: false });
    rows = legacy.data ?? [];
  } else {
    rows = withDate.data ?? [];
  }

  const items = (rows ?? []).map((r: any) => ({
    id: r.id as string,
    title: r.title as string,
    description: (r.description ?? null) as string | null,
    page_count: r.presentation_pages?.[0]?.count ?? 0,
    assigned_date: (r.assigned_date ?? null) as string | null,
    created_at: r.created_at as string,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Presentations</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Lessons assigned by your reviewers.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">
          You do not have any presentations yet.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/my-presentations/${p.id}`}
              className="block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <p className="font-semibold text-slate-800 dark:text-slate-100">{p.title}</p>
              {p.assigned_date && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Assigned {p.assigned_date}
                </p>
              )}
              {p.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {p.description}
                </p>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                {p.page_count} page(s)
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
