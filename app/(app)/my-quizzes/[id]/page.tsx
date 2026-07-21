import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import QuizTaker from "@/components/QuizTaker";
import QuizResult from "@/components/QuizResult";

export const dynamic = "force-dynamic";

export default async function TakeQuizPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const hr = eff?.profile?.hr_code ?? null;
  if (!hr) redirect("/dashboard");

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, description, published")
    .eq("id", params.id)
    .single();
  if (!quiz || !(quiz as any).published) notFound();

  const { data: submission } = await supabase
    .from("quiz_submissions")
    .select("id, submitted_at, auto_score, manual_score, total_score, max_score")
    .eq("quiz_id", params.id)
    .eq("hr_code", hr)
    .maybeSingle();

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, question_order, question_type, prompt, options, points, video_link, drive_file_id, required")
    .eq("quiz_id", params.id)
    .order("question_order");

  if (submission) {
    // Also show their answers.
    const { data: answers } = await supabase
      .from("quiz_answers")
      .select("id, question_id, answer_text, selected_options, other_text, is_correct, points_awarded")
      .eq("submission_id", (submission as any).id);
    return (
      <QuizResult
        quiz={{ id: (quiz as any).id, title: (quiz as any).title }}
        submission={{
          submitted_at: (submission as any).submitted_at,
          auto_score: Number((submission as any).auto_score ?? 0),
          manual_score: Number((submission as any).manual_score ?? 0),
          total_score: Number((submission as any).total_score ?? 0),
          max_score: Number((submission as any).max_score ?? 0),
        }}
        questions={(questions ?? []) as any}
        answers={(answers ?? []) as any}
      />
    );
  }

  return (
    <QuizTaker
      quiz={{
        id: (quiz as any).id,
        title: (quiz as any).title,
        description: (quiz as any).description ?? null,
      }}
      questions={(questions ?? []) as any}
    />
  );
}
