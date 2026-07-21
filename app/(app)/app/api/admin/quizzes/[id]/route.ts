import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { notifyQuizAssignees } from "@/lib/quiz-notify";

export const runtime = "nodejs";

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const s = url.trim();
  const folders = s.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folders) return folders[1];
  const file = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (file) return file[1];
  const idParam = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(s)) return s;
  return null;
}

async function requireReviewer(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !["Admin", "Reviewer", "Supervisor"].includes(profile.role)) {
    return { error: "Reviewers only", status: 403 as const };
  }
  return { user };
}

const VALID_TYPES = new Set([
  "multiple_choice",
  "checkboxes",
  "short_answer",
  "paragraph",
  "multiple_choice_other",
]);

// PUT /api/admin/quizzes/[id] - update title/desc + replace questions atomically
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireReviewer(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim() || null;
  const published = !!body.published;
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (questions.length === 0)
    return NextResponse.json({ error: "At least one question is required." }, { status: 400 });

  // Fetch current published to detect transition off -> on (to email everyone).
  const { data: existing } = await supabase
    .from("quizzes")
    .select("published")
    .eq("id", params.id)
    .single();
  const wasPublished = !!(existing as any)?.published;

  const { error: updErr } = await supabase
    .from("quizzes")
    .update({ title, description, published })
    .eq("id", params.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // Replace questions atomically (delete + insert).
  await supabase.from("quiz_questions").delete().eq("quiz_id", params.id);
  const qRows = questions.map((q: any, i: number) => {
    const t = String(q.question_type || "").trim();
    if (!VALID_TYPES.has(t)) throw new Error(`Question ${i + 1}: unknown type "${t}"`);
    return {
      quiz_id: params.id,
      question_order: i + 1,
      question_type: t,
      prompt: String(q.prompt || "").trim() || `Question ${i + 1}`,
      options: q.options ?? null,
      correct_answers: q.correct_answers ?? null,
      points: q.points != null ? Number(q.points) : 1,
      video_link: q.video_link ? String(q.video_link).trim() : null,
      drive_file_id: q.video_link ? extractDriveId(String(q.video_link)) : null,
      required: q.required !== false,
    };
  });
  const { error: qErr } = await supabase.from("quiz_questions").insert(qRows);
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

  // If publishing for the first time -> notify every current assignee.
  let emailSent = 0;
  if (!wasPublished && published) {
    const { data: assign } = await supabase
      .from("quiz_assignments")
      .select("hr_code")
      .eq("quiz_id", params.id);
    const codes = (assign ?? []).map((a: any) => a.hr_code as string);
    if (codes.length > 0) {
      try {
        const r = await notifyQuizAssignees({
          hrCodes: codes,
          quizId: params.id,
          quizTitle: title,
        });
        emailSent = r.sent;
      } catch (e: any) {
        console.warn("[quizzes/update] notify failed:", e?.message ?? e);
      }
    }
  }

  return NextResponse.json({ ok: true, email_sent: emailSent });
}

// DELETE /api/admin/quizzes/[id] - cascade delete via FK
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireReviewer(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await supabase.from("quizzes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
