import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";

// PATCH /api/admin/quizzes/answers/[id]
// Body: { points_awarded?: number, is_correct?: boolean, reviewer_notes?: string }
// Also recalculates the parent submission's manual_score.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["Admin", "Uploader", "Supervisor"].includes((profile as any).role)) {
    return NextResponse.json({ error: "Reviewers only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const patch: any = {};
  if (typeof body.points_awarded === "number") patch.points_awarded = body.points_awarded;
  if (typeof body.is_correct === "boolean") patch.is_correct = body.is_correct;
  if (typeof body.reviewer_notes === "string") patch.reviewer_notes = body.reviewer_notes;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: ans, error: uErr } = await supabase
    .from("quiz_answers")
    .update(patch)
    .eq("id", params.id)
    .select("submission_id, question_id")
    .single();
  if (uErr || !ans) return NextResponse.json({ error: uErr?.message || "Update failed" }, { status: 400 });

  // Recompute manual_score for the parent submission = sum of points_awarded on
  // answers whose question is TEXT type (short_answer/paragraph). MC / checkbox
  // points already live in submissions.auto_score.
  const { data: allAnswers } = await supabase
    .from("quiz_answers")
    .select("points_awarded, quiz_questions!inner(question_type)")
    .eq("submission_id", ans.submission_id);
  let manual = 0;
  for (const row of (allAnswers ?? []) as any[]) {
    const t = row.quiz_questions?.question_type;
    if (t === "short_answer" || t === "paragraph") {
      manual += Number(row.points_awarded ?? 0);
    }
  }
  await supabase
    .from("quiz_submissions")
    .update({ manual_score: manual })
    .eq("id", ans.submission_id);

  return NextResponse.json({ ok: true });
}
