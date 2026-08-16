import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

// v59: Admin-only bulk password-reset.
//
// POST body:
//   { emails?: string[]   // optional whitelist
//     dry_run?: boolean } // return the list without sending
//
// For each target user we generate a Supabase recovery link with
// admin.generateLink (bypasses Supabase's per-user email throttle because
// WE send the email through our own Gmail SMTP), then email the link via
// lib/email.ts. Returns counts + a per-email status array.

async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "Admin") return { error: "Admins only", status: 403 as const };
  return { user };
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function html(link: string) {
  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <p>Hi,</p>
      <p>You can reset your Collector Performance Dashboard password by clicking the button below. The link is single-use and expires shortly.</p>
      <p><a href="${link}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Set a new password</a></p>
      <p style="color:#64748b;font-size:12px">If the button doesn't work, paste this URL into your browser:<br>${link}</p>
      <p style="color:#64748b;font-size:12px">If you didn't expect this, ignore the email.</p>
    </div>`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY on server." }, { status: 500 });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: "Missing GMAIL_USER / GMAIL_APP_PASSWORD on server." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const whitelist: string[] = Array.isArray(body?.emails)
    ? body.emails.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean)
    : [];
  const dryRun = !!body?.dry_run;

  const a = adminClient();

  // Pull the target list from public.users (has role + squad).
  let query = a.from("users").select("email").not("email", "is", null);
  if (whitelist.length > 0) query = query.in("email", whitelist);
  const { data: rows, error: listErr } = await query;
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });

  const targets = (rows ?? [])
    .map((r: any) => String(r.email ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (dryRun) {
    return NextResponse.json({ ok: true, dry_run: true, total: targets.length, targets });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

  const results: { email: string; ok: boolean; error?: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (const email of targets) {
    try {
      const { data: link, error: linkErr } = await (a.auth.admin as any).generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${appUrl}/reset-password` },
      });
      if (linkErr || !link?.properties?.action_link) {
        throw new Error(linkErr?.message || "No recovery link returned");
      }
      const url = link.properties.action_link as string;
      const ok = await sendEmail({
        to: email,
        subject: "Reset your Collector Performance Dashboard password",
        html: html(url),
      });
      if (!ok) throw new Error("SMTP send returned false");
      sent++;
      results.push({ email, ok: true });
    } catch (e: any) {
      failed++;
      results.push({ email, ok: false, error: e?.message ?? String(e) });
    }
    // Small pacing so we don't hammer Gmail (500/day cap; 100/min soft cap).
    await new Promise((r) => setTimeout(r, 400));
  }

  return NextResponse.json({ ok: true, total: targets.length, sent, failed, results });
}
