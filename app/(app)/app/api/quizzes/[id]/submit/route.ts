import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";

// POST /api/quizzes/[id]/submit
// Body: { answers: [{ question_id, answer_text?, selected_options?, other_text? }, ...] }
// One submission per collector; a duplicate submit returns the existing row.
// Auto-grades MC / Checkbox / MC_other against `correct_answers`.

function arraysEqualIgnoreOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map((s) => s.trim()).sort();
  const sb = [...b].map((s) => s.trim()).sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("hr_code, role")
    .eq("id", user.id)
    .single();
  const hrCode = (profile as any)?.hr_code as string | null;
  if (!hrCode) return NextResponse.json({ error: "Your profile has no hr_code" }, { status: 400 });

  // Enforce single submission at the API layer too (RLS UNIQUE also catches it).
  const { data: existingSub } = await supabase
    .from("quiz_submissions")
    .select("id")
    .eq("quiz_id", params.id)
    .eq("hr_code", hrCode)
    .maybeSingle();
  if (existingSub) {
    return NextResponse.json({ error: "You have already submitted this quiz." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.answers)) {
    return NextResponse.json({ error: "Bad request - expected { answers: [...] }" }, { status: 400 });
  }
  const rawAnswers = body.answers as Array<{
    question_id: string;
    answer_text?: string | null;
    selected_options?: string[] | null;
    other_text?: string | null;
  }>;

  // Load every question so we can grade + validate.
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, question_type, correct_answers, points, required, question_order")
    .eq("quiz_id", params.id)
    .order("question_order");
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "Quiz has no questions" }, { status: 404 });
  }

  const answersById = new Map<string, (typeof rawAnswers)[number]>();
  for (const a of rawAnswers) if (a?.question_id) answersById.set(a.question_id, a);

  // Required-question check.
  for (const q of questions as any[]) {
    if (q.required) {
      const a = answersById.get(q.id);
      const hasText = a?.answer_text?.trim() || a?.other_text?.trim();
      const hasOptions = Array.isArray(a?.selected_options) && a!.selected_options!.length > 0;
      if (!hasText && !hasOptions) {
        return NextResponse.json(
          { error: `Question ${q.question_order} is required` },
          { status: 400 }
        );
      }
    }
  }

  let autoScore = 0;
  const maxScore = (questions as any[]).reduce((acc, q) => acc + (q.points ?? 0), 0);
  const answerRows: any[] = [];

  for (const q of questions as any[]) {
    const a = answersById.get(q.id);
    let isCorrect: boolean | null = null;
    let pointsAwarded = 0;

    if (a) {
      if (q.question_type === "multiple_choice" || q.question_type === "multiple_choice_other") {
        const picked = (a.selected_options ?? [])[0] ?? "";
        const correct = (q.correct_answers ?? "") as string;
        // "Other" answers are considered incorrect unless correct_answers === "Other" AND text present.
        if (correct) {
          if (q.question_type === "multiple_choice_other" && picked.toLowerCase() === "other") {
            isCorrect = correct.toLowerCase() === "other" && !!a.other_text?.trim();
          } else {
            isCorrect = picked === correct;
          }
          if (isCorrect) { pointsAwarded = q.points ?? 0; autoScore += pointsAwarded; }
        }
      } else if (q.question_type === "checkboxes") {
        const picked = (a.selected_options ?? []) as string[];
        const correct = Array.isArray(q.correct_answers) ? (q.correct_answers as string[]) : null;
        if (correct) {
          isCorrect = arraysEqualIgnoreOrder(picked, correct);
          if (isCorrect) { pointsAwarded = q.points ?? 0; autoScore += pointsAwarded; }
        }
      }
      // Text types: leave is_correct = null (needs manual review).
    }

    answerRows.push({
      question_id: q.id,
      answer_text: a?.answer_text ?? null,
      selected_options: a?.selected_options ?? null,
      other_text: a?.other_text ?? null,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
    });
  }

  const { data: sub, error: subErr } = await supabase
    .from("quiz_submissions")
    .insert({
      quiz_id: params.id,
      hr_code: hrCode,
      auto_score: autoScore,
      manual_score: 0,
      max_score: maxScore,
    })
    .select("id, auto_score, max_score")
    .single();
  if (subErr || !sub) {
    return NextResponse.json({ error: subErr?.message || "Submit failed" }, { status: 400 });
  }

  const withSub = answerRows.map((r) => ({ ...r, submission_id: sub.id }));
  const { error: ansErr } = await supabase.from("quiz_answers").insert(withSub);
  if (ansErr) {
    // Roll back the submission if answer insert failed.
    await supabase.from("quiz_submissions").delete().eq("id", sub.id);
    return NextResponse.json({ error: ansErr.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    submission_id: sub.id,
    auto_score: sub.auto_score,
    max_score: sub.max_score,
  });
}
