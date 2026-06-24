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
  // 1) Caller must be a signed-in Admin.
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
  if (me?.role !== "Admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const action = String(body.action || "");
  const a = adminClient();

  // ---- DELETE USER ----------------------------------------------------------
  if (action === "delete") {
    const id = String(body.profileId || "");
    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    if (id === user.id) {
      return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
    }
    const { error } = await a.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // Profile row is normally removed by the FK cascade; clean up just in case.
    await a.from("profiles").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // ---- UPDATE LOGIN EMAIL ----------------------------------------------------
  if (action === "updateEmail") {
    const id = String(body.profileId || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!id || !email) return NextResponse.json({ error: "Missing user id / email" }, { status: 400 });
    if (id === user.id) {
      return NextResponse.json({ error: "You can't change your own email here." }, { status: 400 });
    }
    const { error } = await a.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await a.from("profiles").update({ email }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // ---- CREATE USER ----------------------------------------------------------
  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const full_name = String(body.full_name || "").trim();
    const hr_code = String(body.hr_code || "").trim().toUpperCase();
    const team = body.team ? String(body.team).trim() : null;
    const role = String(body.role || "Viewer");
    if (!email || !hr_code) {
      return NextResponse.json({ error: "Email and HR code are required." }, { status: 400 });
    }
    if (!/^[AI]-\d+$/.test(hr_code)) {
      return NextResponse.json({ error: "HR code must be A-1234 or I-1234." }, { status: 400 });
    }

    // Temporary password — the new user changes it via "Forgot password".
    const tempPassword =
      "Hudl-" + Math.random().toString(36).slice(2, 10) + "-" + Math.floor(Math.random() * 9000 + 1000);

    const { data: created, error } = await a.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, hr_code, team },
    });
    if (error || !created.user) {
      return NextResponse.json({ error: error?.message || "Could not create user" }, { status: 400 });
    }
    const newId = created.user.id;

    // The signup trigger created the profile (role Viewer) and linked/created the
    // collector. Set the chosen role and the collector's name/team.
    await a.from("profiles").update({ role }).eq("id", newId);
    const collectorPatch: Record<string, unknown> = {};
    if (full_name) collectorPatch.name = full_name;
    if (team) collectorPatch.team = team;
    if (Object.keys(collectorPatch).length) {
      await a.from("collectors").update(collectorPatch).eq("hr_code", hr_code);
    }

    const { data: col } = await a
      .from("collectors")
      .select("id")
      .eq("hr_code", hr_code)
      .maybeSingle();

    return NextResponse.json({ ok: true, id: newId, tempPassword, collectorId: col?.id ?? null });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
