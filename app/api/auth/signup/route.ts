import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Public signup endpoint. We provision the auth user via the admin API with
// email_confirm:true so Supabase does NOT send a confirmation email — this
// sidesteps Supabase's built-in email rate limit that blocks normal signUp().
//
// The handle_new_user() trigger still runs and creates the profile + links
// the collector based on user_metadata.

export const runtime = "nodejs";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
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

  // HR code must not already be linked to a profile.
  const { data: available, error: checkErr } = await a.rpc("hr_code_available", { p_code: hr_code });
  if (checkErr) {
    return NextResponse.json({ error: checkErr.message }, { status: 400 });
  }
  if (available === false) {
    return NextResponse.json({ error: `HR code "${hr_code}" is already registered.` }, { status: 400 });
  }

  // Create the auth user. email_confirm:true means no confirmation email is
  // sent (and the user can sign in immediately).
  const { data: created, error } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, hr_code, team },
  });
  if (error || !created.user) {
    return NextResponse.json(
      { error: error?.message || "Could not create user" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
