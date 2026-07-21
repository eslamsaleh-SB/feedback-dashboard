import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";

export const dynamic = "force-dynamic";

export default async function MyQuizzesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const hr = eff?.profile?.hr_code ?? null;
  if (!hr) redirect("/dashboard");

  // Assignments joined with quiz + my submission (if any).
  const { data: assign } = await supabase
    .from("quiz_assignments")
    .select("assigned_at, quizzes!inner(id, title, description, published)")
    .eq("hr_code", hr)
    .order("assigned_at", { ascending: false });

  const quizIds = (assign ?? [])
    .map((a: any) => a.quizzes?.id as string)
    .filter(Boolean);

  const submissionByQuiz = new Map<string, any>();
  if (quizIds.length > 0) {
    const { data: subs } = await supabase
      .from("quiz_submissions")
      .select("id, quiz_id, submitted_at, total_score, max_score")
      .eq("hr_code", hr)
      .in("quiz_id", quizIds);
    for (const s of subs ?? []) submissionByQuiz.set((s as any).quiz_id, s);
  }

  const rows = (assign ?? []).map((a: any) => ({
    id: a.quizzes.id as string,
    title: a.quizzes.title as string,
    description: a.quizzes.description as string | null,
    published: !!a.quizzes.published,
    submission: submissionByQuiz.get(a.quizzes.id) ?? null,
  })).filter((r) => r.published);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quizzes</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Complete each quiz assigned to you. You can only submit once.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No quizzes assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((q) => (
            <Link
              key={q.id}
              href={`/my-quizzes/${q.id}`}
              className="block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{q.title}</p>
                  {q.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">{q.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {q.submission ? (
                    <>
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-medium">Completed</span>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5">
                        Score {Number(q.submission.total_score).toFixed(0)} / {Number(q.submission.max_score).toFixed(0)}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">To do</span>
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
