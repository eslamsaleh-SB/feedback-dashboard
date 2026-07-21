import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { notifyQuizAssignees } from "@/lib/quiz-notify";

export const runtime = "nodejs";

// POST /api/admin/quizzes/[id]/resend
// Body: { hr_codes?: string[] }   -> resend to specific collectors.
// If body.hr_codes is missing, resend to every ASSIGNED collector who
// has NOT submitted yet.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const body = await req.json().catch(() => ({} as any));
  const requested: string[] | null = Array.isArray(body?.hr_codes)
    ? body.hr_codes.map((s: any) => String(s).trim()).filter(Boolean)
    : null;

  const { data: q } = await supabase
    .from("quizzes")
    .select("title, published")
    .eq("id", params.id)
    .single();
  if (!q) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  if (!(q as any).published) {
    return NextResponse.json({ error: "Publish the quiz before resending emails." }, { status: 400 });
  }

  let hrCodes: string[] = [];
  if (requested) {
    hrCodes = requested;
  } else {
    // Every assignee minus everyone who has already submitted.
    const [{ data: assign }, { data: subs }] = await Promise.all([
      supabase.from("quiz_assignments").select("hr_code").eq("quiz_id", params.id),
      supabase.from("quiz_submissions").select("hr_code").eq("quiz_id", params.id),
    ]);
    const submitted = new Set((subs ?? []).map((s: any) => s.hr_code as string));
    hrCodes = (assign ?? [])
      .map((a: any) => a.hr_code as string)
      .filter((c: string) => !submitted.has(c));
  }

  const r = await notifyQuizAssignees({
    hrCodes,
    quizId: params.id,
    quizTitle: (q as any).title ?? "Quiz",
    reason: "reminder",
  });

  return NextResponse.json({ ok: true, ...r });
}
