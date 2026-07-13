import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";

export const dynamic = "force-dynamic";

export default async function AdminPresentationsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = profile?.role ?? "Viewer";
  if (!["Admin", "Uploader", "Supervisor"].includes(role)) redirect("/my-presentations");

  const { data: rows } = await supabase
    .from("presentations")
    .select("id, title, description, created_at, google_slides_url, presentation_pages(count), presentation_assignments(count)")
    .order("created_at", { ascending: false });

  const presentations = (rows ?? []).map((r: any) => ({
    id: r.id as string,
    title: r.title as string,
    description: (r.description ?? null) as string | null,
    created_at: r.created_at as string,
    google_slides_url: (r.google_slides_url ?? null) as string | null,
    page_count: r.presentation_pages?.[0]?.count ?? 0,
    assignee_count: r.presentation_assignments?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Presentations</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Build multi-page lessons and assign them to collectors.
          </p>
        </div>
        <Link
          href="/admin-presentations/new"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          New presentation
        </Link>
      </div>

      {presentations.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No presentations yet.</p>
      ) : (
        <div className="space-y-2">
          {presentations.map((p) => (
            <Link
              key={p.id}
              href={`/admin-presentations/${p.id}`}
              className="block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{p.title}</p>
                  {p.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {p.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5">
                    {p.page_count} page(s)
                  </span>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5">
                    {p.assignee_count} assigned
                  </span>
                  {p.google_slides_url && (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                      Exported to Slides
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
