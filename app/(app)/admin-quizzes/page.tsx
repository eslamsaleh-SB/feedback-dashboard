import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";

export const dynamic = "force-dynamic";

export default async function AdminQuizzesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const role = eff?.profile?.role ?? "Viewer";
  if (!["Admin", "Uploader", "Supervisor"].includes(role)) redirect("/my-quizzes");

  const { data: rows } = await supabase
    .from("quizzes")
    .select("id, title, description, published, created_at, quiz_questions(count), quiz_assignments(count), quiz_submissions(count)")
    .order("created_at", { ascending: false });

  const quizzes = (rows ?? []).map((r: any) => ({
    id: r.id as string,
    title: r.title as string,
    description: (r.description ?? null) as string | null,
    published: !!r.published,
    created_at: r.created_at as string,
    question_count: r.quiz_questions?.[0]?.count ?? 0,
    assignee_count: r.quiz_assignments?.[0]?.count ?? 0,
    submission_count: r.quiz_submissions?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quizzes</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Build quizzes, assign them, review submissions.
          </p>
        </div>
        <Link
          href="/admin-quizzes/new"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          New quiz
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No quizzes yet.</p>
      ) : (
        <div className="space-y-2">
          {quizzes.map((q) => {
            const pending = Math.max(0, q.assignee_count - q.submission_count);
            const completionRate = q.assignee_count > 0
              ? Math.round((q.submission_count / q.assignee_count) * 100)
              : 0;
            return (
              <div
                key={q.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <Link href={`/admin-quizzes/${q.id}`} className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      {q.title}
                      <span
                        className={`ml-2 text-xs rounded-full px-2 py-0.5 ${
                          q.published
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {q.published ? "Published" : "Draft"}
                      </span>
                    </p>
                    {q.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
                        {q.description}
                      </p>
                    )}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5">
                      {q.question_count} question(s)
                    </span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5">
                      {q.submission_count}/{q.assignee_count} done ({completionRate}%)
                    </span>
                    {pending > 0 && (
                      <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                        {pending} pending
                      </span>
                    )}
                    <Link
                      href={`/admin-quizzes/${q.id}`}
                      className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
