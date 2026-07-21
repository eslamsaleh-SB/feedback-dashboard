import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { notifyPresentationAssignees } from "@/lib/presentation-notify";

export const runtime = "nodejs";

async function requireReviewer(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
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

// PUT /api/admin/presentations/[id]/assignments - replace the assignee list
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
    .from("presentation_assignments")
    .select("hr_code")
    .eq("presentation_id", params.id);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });

  const existingSet = new Set((existing ?? []).map((r: any) => r.hr_code as string));
  const nextSet = new Set(hrCodes);

  const toRemove = Array.from(existingSet).filter((hr) => !nextSet.has(hr));
  const toAdd = Array.from(nextSet).filter((hr) => !existingSet.has(hr));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("presentation_assignments")
      .delete()
      .eq("presentation_id", params.id)
      .in("hr_code", toRemove);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let emailSent = 0;
  let emailFailed: string[] = [];
  if (toAdd.length > 0) {
    const rows = toAdd.map((hr) => ({
      presentation_id: params.id,
      hr_code: hr,
      assigned_by: auth.user.id,
    }));
    const { error } = await supabase.from("presentation_assignments").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    try {
      const { data: pres } = await supabase
        .from("presentations")
        .select("title")
        .eq("id", params.id)
        .single();
      const title = (pres as any)?.title ?? "Presentation";
      const notify = await notifyPresentationAssignees({
        hrCodes: toAdd,
        presentationId: params.id,
        presentationTitle: title,
      });
      emailSent = notify.sent;
      emailFailed = notify.failed;
    } catch (e: any) {
      console.warn("[presentations/assignments] notify failed:", e?.message ?? e);
    }
  }

  return NextResponse.json({
    ok: true,
    added: toAdd.length,
    removed: toRemove.length,
    current: hrCodes.length,
    email_sent: emailSent,
    email_failed: emailFailed,
  });
}
