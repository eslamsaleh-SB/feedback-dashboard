import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// v59: public signup rewritten to work post-v56 refactor.
//
// - The old `hr_code_available` RPC referenced the pre-v56 `profiles` table
//   and was throwing "Could not create account". We do the collision check
//   with a plain SELECT on `public.users` instead.
// - The v11 `handle_new_user()` trigger that created the profile row was
//   dropped when we killed `profiles`. So this route now inserts the
//   `public.users` row itself (matching the /api/admin/users create path).
// - If the users row insert fails we roll back the auth user so we don't
//   leave an orphan login.

export const runtime = "nodejs";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    return await signupHandler(req);
  } catch (e: any) {
    // v59: last-resort catch so ANY exception is surfaced to the client
    // instead of Next.js returning a generic 500 with no JSON body.
    console.error("[signup] uncaught:", e?.message ?? e, e?.stack);
    return NextResponse.json(
      { error: e?.message ? `Signup failed: ${e.message}` : "Signup failed (unknown error)" },
      { status: 500 }
    );
  }
}

async function signupHandler(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const full_name = String(body.full_name || "").trim();
  const hr_code = String(body.hr_code || "").trim().toUpperCase();
  const team = body.team ? String(body.team).trim() : null;
  const title = body.title ? String(body.title).trim() : null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (!full_name) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!hr_code) {
    return NextResponse.json({ error: "HR code is required." }, { status: 400 });
  }
  if (!/^[AI]-\d+$/.test(hr_code)) {
    return NextResponse.json(
      { error: "HR code must be A-1234 or I-1234 (letter A or I, a dash, then numbers)." },
      { status: 400 }
    );
  }

  const a = adminClient();

  // v59: check hr_code collision + email collision directly on public.users.
  {
    const { data: hrExists } = await a
      .from("users")
      .select("id")
      .eq("hr_code", hr_code)
      .maybeSingle();
    if (hrExists) {
      return NextResponse.json(
        { error: `HR code "${hr_code}" is already registered.` },
        { status: 400 }
      );
    }
    const { data: emailExists } = await a
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (emailExists) {
      return NextResponse.json(
        { error: `An account already exists for "${email}".` },
        { status: 400 }
      );
    }
  }

  // Create the auth user. email_confirm:true = no confirmation email needed.
  const { data: created, error } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, hr_code, team, title },
  });
  let newId: string;
  if (error || !created?.user) {
    // v59 auto-heal: public.users row got deleted but auth.users still holds
    // the email → createUser errors with "already registered". Look up the
    // orphan auth id, reset the password to what the user typed, and use
    // that id to insert the missing public.users row below.
    const msg = String(error?.message ?? "").toLowerCase();
    const isDuplicate = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!isDuplicate) {
      return NextResponse.json(
        { error: error?.message || "Could not create user" },
        { status: 400 }
      );
    }
    // Find the auth user by email.
    const { data: list, error: listErr } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });
    const orphan = (list?.users ?? []).find((u: any) =>
      String(u.email ?? "").toLowerCase() === email
    );
    if (!orphan) {
      return NextResponse.json(
        { error: error?.message || "Could not create user" },
        { status: 400 }
      );
    }
    // Reset password so the user can sign in with what they just typed.
    await a.auth.admin.updateUserById(orphan.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name, hr_code, team, title },
    });
    newId = orphan.id;
  } else {
    newId = created.user.id;
  }

  // v59: split full_name into first_name/last_name to match the shape used
  // by the /users admin CRUD. Best-effort split — anything past the first
  // space lands in last_name.
  const parts = full_name.split(/\s+/);
  const first_name = parts[0] || full_name;
  const last_name = parts.slice(1).join(" ") || null;

  const { error: insErr } = await a.from("users").upsert({
    id: newId,
    email,
    hr_code,
    first_name,
    last_name,
    squad: team,
    job_title: title,
    role: "Viewer",
  }, { onConflict: "id" });
  if (insErr) {
    // Only roll back the auth user if WE just created it. When we're
    // healing an orphan we keep the login intact.
    if (created?.user) await a.auth.admin.deleteUser(newId);
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
