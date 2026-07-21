import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import SubmissionReview from "@/components/SubmissionReview";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionPage({
  params,
}: {
  params: { id: string; submissionId: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const role = eff?.profile?.role ?? "Viewer";
  if (!["Admin", "Uploader", "Supervisor"].includes(role)) redirect("/my-quizzes");

  const [{ data: quiz }, { data: sub }, { data: questions }, { data: answers }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("id", params.id).single(),
    supabase.from("quiz_submissions")
      .select("id, hr_code, submitted_at, auto_score, manual_score, total_score, max_score")
      .eq("id", params.submissionId).single(),
    supabase.from("quiz_questions")
      .select("id, question_order, question_type, prompt, options, correct_answers, points, video_link, drive_file_id")
      .eq("quiz_id", params.id).order("question_order"),
    supabase.from("quiz_answers")
      .select("id, question_id, answer_text, selected_options, other_text, is_correct, points_awarded, reviewer_notes")
      .eq("submission_id", params.submissionId),
  ]);

  if (!quiz || !sub) notFound();

  // Look up collector display info.
  const { data: collector } = await supabase
    .from("collectors")
    .select("hr_code, name, team")
    .eq("hr_code", (sub as any).hr_code)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin-quizzes/${params.id}`}
          className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
        >
          &larr; Back to quiz
        </Link>
        <h1 className="text-2xl font-bold mt-1">{(quiz as any).title}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Submission by <strong>{(sub as any).hr_code}</strong>
          {collector?.name && ` - ${collector.name}`}
          {collector?.team && ` - ${collector.team}`}
        </p>
      </div>
      <SubmissionReview
        submission={{
          id: (sub as any).id,
          hr_code: (sub as any).hr_code,
          submitted_at: (sub as any).submitted_at,
          auto_score: Number((sub as any).auto_score ?? 0),
          manual_score: Number((sub as any).manual_score ?? 0),
          total_score: Number((sub as any).total_score ?? 0),
          max_score: Number((sub as any).max_score ?? 0),
        }}
        questions={(questions ?? []) as any}
        answers={(answers ?? []) as any}
      />
    </div>
  );
}
