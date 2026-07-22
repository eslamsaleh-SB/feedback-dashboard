import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

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

// PUT /api/admin/presentations/[id] - replace title/desc/pages atomically
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
  const pages = Array.isArray(body.pages) ? body.pages : [];
  // v59: optional assigned_date (YYYY-MM-DD). Only patched if the client
  // sent one — otherwise leave the existing value alone.
  const rawDate = String(body.assigned_date || "").trim();
  const assignedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (pages.length === 0) {
    return NextResponse.json({ error: "At least one page is required." }, { status: 400 });
  }

  const updatePatch: Record<string, unknown> = { title, description };
  if (assignedDate) updatePatch.assigned_date = assignedDate;
  const { error: updateErr } = await supabase
    .from("presentations")
    .update(updatePatch)
    .eq("id", params.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  // Replace pages: delete all + insert fresh. Simpler than diff for this MVP.
  await supabase.from("presentation_pages").delete().eq("presentation_id", params.id);
  const pageRows = pages.map((p: any, i: number) => ({
    presentation_id: params.id,
    page_order: i + 1,
    header: String(p.header || "").trim() || `Page ${i + 1}`,
    description: String(p.description || "").trim() || null,
    video_link: String(p.video_link || "").trim() || null,
    drive_file_id: extractDriveId(String(p.video_link || "")),
  }));
  const { error: insertErr } = await supabase.from("presentation_pages").insert(pageRows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/presentations/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireReviewer(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await supabase.from("presentations").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
