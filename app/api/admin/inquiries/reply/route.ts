import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  if (isViewingAs()) {
    return NextResponse.json(
      { error: "Read-only: exit the 'View as' preview before making changes." },
      { status: 403 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["Admin", "Uploader", "Supervisor"].includes(me.role)) {
    return NextResponse.json({ error: "Reviewers only" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const videoId = String(body.video_id || "");
  const reply = String(body.reply_text || "").trim();
  if (!videoId || !reply) {
    return NextResponse.json(
      { error: "video_id and reply_text are required" },
      { status: 400 }
    );
  }

  const a = adminClient();
  const { error } = await a
    .from("match_inquiry_videos")
    .update({
      reply_text: reply,
      replied_at: new Date().toISOString(),
      replied_by: user.id,
    })
    .eq("id", videoId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
