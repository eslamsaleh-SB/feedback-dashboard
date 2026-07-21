import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// v57: full CRUD against `users` directly. No more `profiles` (renamed away
// in v56) or `collectors` (being phased out) - both silently broke every
// action on this route since v56 shipped.

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Columns an Admin may write via the "update" action. Whitelisted so a bad
// client payload can't touch id / created_at / is_active (generated).
const EDITABLE_COLUMNS = [
  "email",
  "hr_code",
  "legacy_id",
  "first_name",
  "last_name",
  "mobile_number",
  "squad",
  "job_title",
  "role",
] as const;

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
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((me as any)?.role !== "Admin") {
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
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    if (id === user.id) {
      return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
    }
    const { error } = await a.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // FK from users.id -> auth.users(id) should cascade, but clean up
    // explicitly in case that constraint is ever relaxed.
    await a.from("users").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // ---- UPDATE ANY EDITABLE COLUMN --------------------------------------------
  if (action === "update") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    for (const col of EDITABLE_COLUMNS) {
      if (Object.prototype.hasOwnProperty.call(body.patch ?? {}, col)) {
        let v = (body.patch as any)[col];
        if (typeof v === "string") v = v.trim();
        patch[col] = v === "" ? null : v;
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Email changes must go through auth too, so login stays in sync.
    if (typeof patch.email === "string") {
      const email = (patch.email as string).toLowerCase();
      patch.email = email;
      const { error: authErr } = await a.auth.admin.updateUserById(id, {
        email,
        email_confirm: true,
      });
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const { error } = await a.from("users").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // ---- CREATE USER ----------------------------------------------------------
  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const hr_code = String(body.hr_code || "").trim();
    if (!email || !hr_code) {
      return NextResponse.json({ error: "Email and HR code are required." }, { status: 400 });
    }

    const tempPassword =
      "Hudl-" + Math.random().toString(36).slice(2, 10) + "-" + Math.floor(Math.random() * 9000 + 1000);

    const { data: created, error } = await a.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (error || !created.user) {
      return NextResponse.json({ error: error?.message || "Could not create user" }, { status: 400 });
    }
    const newId = created.user.id;

    // No trigger writes the `users` row anymore (dropped in v57 - it pointed
    // at the pre-v56 `profiles` table). Insert it ourselves.
    const { error: insErr } = await a.from("users").insert({
      id: newId,
      email,
      hr_code,
      legacy_id: body.legacy_id || null,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      mobile_number: body.mobile_number || null,
      squad: body.squad || null,
      job_title: body.job_title || null,
      role: body.role || "Viewer",
    });
    if (insErr) {
      // Roll back the auth user so we don't leave an orphaned login.
      await a.auth.admin.deleteUser(newId);
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: newId, tempPassword });
  }

  // ---- RESET PASSWORD (admin-triggered; no email, so no rate limit) ---------
  if (action === "resetPassword") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    if (id === user.id) {
      return NextResponse.json({ error: "Use the login page's 'Forgot password' for your own account." }, { status: 400 });
    }
    const tempPassword =
      "Hudl-" + Math.random().toString(36).slice(2, 10) + "-" + Math.floor(Math.random() * 9000 + 1000);
    const { error } = await a.auth.admin.updateUserById(id, { password: tempPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, tempPassword });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
