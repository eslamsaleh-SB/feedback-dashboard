import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { VIEW_AS_COOKIE } from "@/lib/effective";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "Admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const target = body?.profileId ? String(body.profileId) : null;
  const c = cookies();
  if (!target || target === user.id) {
    c.delete(VIEW_AS_COOKIE);
  } else {
    c.set(VIEW_AS_COOKIE, target, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  return NextResponse.json({ ok: true });
}
