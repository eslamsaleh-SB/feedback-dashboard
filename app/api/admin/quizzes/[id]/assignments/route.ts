import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { notifyQuizAssignees } from "@/lib/quiz-notify";

export const runtime = "nodejs";

async function requireReviewer(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["Admin", "Uploader", "Supervisor"].includes(profile.role)) {
    return { error: "Reviewers only", status: 403 as const };
  }
  return { user };
}

// PUT /api/admin/quizzes/[id]/assignments - replace assignee list
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireReviewer(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const hrCodes: string[] = Array.isArray(body.hr_codes)
    ? body.hr_codes.map((s: any) => String(s).trim()).filter(Boolean)
    : [];

  const { data: existing, error: fetchErr } = await supabase
    .from("quiz_assignments")
    .select("hr_code")
    .eq("quiz_id", params.id);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });

  const existingSet = new Set((existing ?? []).map((r: any) => r.hr_code as string));
  const nextSet = new Set(hrCodes);
  const toRemove = Array.from(existingSet).filter((hr) => !nextSet.has(hr));
  const toAdd = Array.from(nextSet).filter((hr) => !existingSet.has(hr));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("quiz_assignments")
      .delete()
      .eq("quiz_id", params.id)
      .in("hr_code", toRemove);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  let emailSent = 0;
  if (toAdd.length > 0) {
    const rows = toAdd.map((hr) => ({
      quiz_id: params.id,
      hr_code: hr,
      assigned_by: auth.user.id,
    }));
    const { error } = await supabase.from("quiz_assignments").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Notify only if the quiz is published.
    const { data: q } = await supabase
      .from("quizzes")
      .select("title, published")
      .eq("id", params.id)
      .single();
    if ((q as any)?.published) {
      try {
        const r = await notifyQuizAssignees({
          hrCodes: toAdd,
          quizId: params.id,
          quizTitle: (q as any)?.title ?? "Quiz",
        });
        emailSent = r.sent;
      } catch {}
    }
  }

  return NextResponse.json({
    ok: true,
    added: toAdd.length,
    removed: toRemove.length,
    email_sent: emailSent,
  });
}
