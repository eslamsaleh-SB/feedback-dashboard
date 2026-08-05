import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// v59: admin-only DELETE for a sent report (match_sessions row + its
// session_notes, session_videos, session_acknowledgments cascade). RLS +
// FKs handle the child rows in most cases; we still clean up explicitly to
// avoid orphans if the FKs aren't ON DELETE CASCADE in this environment.

async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "Admin") {
    return { error: "Admins only", status: 403 as const };
  }
  return { user };
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = params.id;
  const a = adminClient();

  // Best-effort explicit cascade before dropping the parent row.
  await a.from("session_notes").delete().eq("session_id", id);
  await a.from("session_videos").delete().eq("match_session_id", id);
  await a.from("session_acknowledgments").delete().eq("session_id", id);

  const { error } = await a.from("match_sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
