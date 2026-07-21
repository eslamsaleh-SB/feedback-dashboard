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
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["Admin", "Uploader", "Supervisor"].includes(profile.role)) {
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

// POST /api/admin/quizzes - create a new quiz + questions + assignees + email
export async function POST(req: NextRequest) {
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
  const assigneeHrCodes: string[] = Array.isArray(body.hr_codes)
    ? body.hr_codes.map((s: any) => String(s).trim()).filter(Boolean)
    : [];

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (questions.length === 0)
    return NextResponse.json({ error: "At least one question is required." }, { status: 400 });

  const { data: created, error: createErr } = await supabase
    .from("quizzes")
    .insert({ title, description, created_by: auth.user.id, published })
    .select("id")
    .single();
  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message || "Create failed" }, { status: 400 });
  }
  const quizId = created.id as string;

  const qRows = questions.map((q: any, i: number) => {
    const t = String(q.question_type || "").trim();
    if (!VALID_TYPES.has(t)) throw new Error(`Question ${i + 1}: unknown type "${t}"`);
    return {
      quiz_id: quizId,
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

  try {
    const { error: qErr } = await supabase.from("quiz_questions").insert(qRows);
    if (qErr) throw qErr;
  } catch (e: any) {
    // Roll back quiz row so we don't leak an empty quiz
    await supabase.from("quizzes").delete().eq("id", quizId);
    return NextResponse.json({ error: e.message || "Failed to save questions" }, { status: 400 });
  }

  let emailSent = 0;
  let emailFailed: string[] = [];
  if (assigneeHrCodes.length > 0) {
    const rows = assigneeHrCodes.map((hr) => ({
      quiz_id: quizId,
      hr_code: hr,
      assigned_by: auth.user.id,
    }));
    await supabase.from("quiz_assignments").insert(rows);
    if (published) {
      try {
        const r = await notifyQuizAssignees({
          hrCodes: assigneeHrCodes,
          quizId,
          quizTitle: title,
        });
        emailSent = r.sent;
        emailFailed = r.failed;
      } catch (e: any) {
        console.warn("[quizzes/create] notify failed:", e?.message ?? e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    id: quizId,
    email_sent: emailSent,
    email_failed: emailFailed,
  });
}
