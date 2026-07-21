import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import QuizBuilder from "@/components/QuizBuilder";
import QuizAnalytics from "@/components/QuizAnalytics";

export const dynamic = "force-dynamic";

export default async function AdminQuizDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const role = eff?.profile?.role ?? "Viewer";
  if (!["Admin", "Reviewer", "Supervisor"].includes(role)) redirect("/my-quizzes");

  const [
    { data: quiz },
    { data: questions },
    { data: assign },
    { data: subs },
    { data: collectors },
  ] = await Promise.all([
    supabase.from("quizzes")
      .select("id, title, description, published, created_at")
      .eq("id", params.id).single(),
    supabase.from("quiz_questions")
      .select("id, question_order, question_type, prompt, options, correct_answers, points, video_link, drive_file_id, required")
      .eq("quiz_id", params.id).order("question_order"),
    supabase.from("quiz_assignments")
      .select("hr_code, assigned_at, last_notified_at")
      .eq("quiz_id", params.id),
    supabase.from("quiz_submissions")
      .select("id, hr_code, submitted_at, auto_score, manual_score, total_score, max_score")
      .eq("quiz_id", params.id).order("submitted_at", { ascending: false }),
    supabase.from("users")
      .select("hr_code, first_name, last_name, squad").not("hr_code", "is", null).order("hr_code"),
  ]);

  if (!quiz) notFound();

  const questionCount = (questions ?? []).length;
  const maxScore = (questions ?? []).reduce((acc: number, q: any) => acc + (q.points ?? 0), 0);
  const totalPoints = maxScore;

  return (
    <div className="space-y-8">
      <QuizBuilder
        mode="edit"
        collectors={(collectors ?? []).map((u: any) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
          return {
            hr_code: u.hr_code as string,
            name: (name || u.hr_code) as string,
            team: (u.squad ?? null) as string | null,
          };
        })}
        initial={{
          id: (quiz as any).id,
          title: (quiz as any).title,
          description: (quiz as any).description ?? "",
          published: !!(quiz as any).published,
          hr_codes: (assign ?? []).map((a: any) => a.hr_code as string),
          questions: (questions ?? []).map((q: any) => ({
            question_type: q.question_type,
            prompt: q.prompt,
            options: Array.isArray(q.options) ? q.options : [],
            correct_answers: q.correct_answers,
            points: q.points,
            video_link: q.video_link ?? "",
            drive_file_id: q.drive_file_id ?? null,
            required: !!q.required,
          })),
        }}
      />

      <QuizAnalytics
        quizId={(quiz as any).id}
        title={(quiz as any).title}
        maxScore={totalPoints}
        collectors={(collectors ?? []).map((u: any) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
          return {
            hr_code: u.hr_code as string,
            name: (name || u.hr_code) as string,
            team: (u.squad ?? null) as string | null,
          };
        })}
        assignments={(assign ?? []).map((a: any) => ({
          hr_code: a.hr_code as string,
          assigned_at: a.assigned_at as string,
          last_notified_at: (a.last_notified_at ?? null) as string | null,
        }))}
        submissions={(subs ?? []).map((s: any) => ({
          id: s.id as string,
          hr_code: s.hr_code as string,
          submitted_at: s.submitted_at as string,
          auto_score: Number(s.auto_score ?? 0),
          manual_score: Number(s.manual_score ?? 0),
          total_score: Number(s.total_score ?? 0),
          max_score: Number(s.max_score ?? 0),
        }))}
      />

      <div className="text-xs text-slate-400 dark:text-slate-500">
        {questionCount} questions - max score {maxScore}.{" "}
        <Link className="underline" href="/admin-quizzes">Back to quizzes list</Link>
      </div>
    </div>
  );
}
