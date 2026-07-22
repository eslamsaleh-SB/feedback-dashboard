import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { notifyPresentationAssignees } from "@/lib/presentation-notify";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Reviewer", "Supervisor"].includes(profile.role)) {
    return { error: "Reviewers only", status: 403 as const };
  }
  return { user };
}

// POST /api/admin/presentations - create a new presentation with pages
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
  const pages = Array.isArray(body.pages) ? body.pages : [];
  const assigneeHrCodes: string[] = Array.isArray(body.hr_codes) ? body.hr_codes : [];
  // v59: admin-chosen assign date (YYYY-MM-DD). Falls back to today when
  // absent or malformed so existing clients keep working.
  const rawDate = String(body.assigned_date || "").trim();
  const assignedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (pages.length === 0) {
    return NextResponse.json({ error: "At least one page is required." }, { status: 400 });
  }

  const { data: created, error: createErr } = await supabase
    .from("presentations")
    .insert({ title, description, created_by: auth.user.id, assigned_date: assignedDate })
    .select("id")
    .single();
  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message || "Create failed" }, { status: 400 });
  }
  const presentationId = created.id as string;

  const pageRows = pages.map((p: any, i: number) => ({
    presentation_id: presentationId,
    page_order: i + 1,
    header: String(p.header || "").trim() || `Page ${i + 1}`,
    description: String(p.description || "").trim() || null,
    video_link: String(p.video_link || "").trim() || null,
    drive_file_id: extractDriveId(String(p.video_link || "")),
  }));
  const { error: pagesErr } = await supabase.from("presentation_pages").insert(pageRows);
  if (pagesErr) {
    return NextResponse.json({ error: pagesErr.message }, { status: 400 });
  }

  let emailSent = 0;
  let emailFailed: string[] = [];
  if (assigneeHrCodes.length > 0) {
    const rows = assigneeHrCodes.map((hr) => ({
      presentation_id: presentationId,
      hr_code: hr,
      assigned_by: auth.user.id,
    }));
    await supabase.from("presentation_assignments").insert(rows);

    try {
      const notify = await notifyPresentationAssignees({
        hrCodes: assigneeHrCodes,
        presentationId,
        presentationTitle: title,
      });
      emailSent = notify.sent;
      emailFailed = notify.failed;
    } catch (e: any) {
      console.warn("[presentations/create] notify failed:", e?.message ?? e);
    }
  }

  return NextResponse.json({
    ok: true,
    id: presentationId,
    email_sent: emailSent,
    email_failed: emailFailed,
  });
}
