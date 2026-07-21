// POST /api/admin/users-import
// Admin-only bulk onboarding endpoint. Accepts a CSV/TSV with header row:
//   email, hr_code, first_name, last_name, mobile_number, legacy_id, squad, job_title
//
// For each row:
//   1. Upsert into public.users_import (staging).
//   2. If no auth.users row exists for that email, call auth.admin.createUser
//      with email_confirm=true + a random password.
//   3. Trigger a password-recovery email (auth.admin.generateLink) so the
//      person picks their own password on first login.
//   4. Upsert the enriched row into public.users (hr_code + legacy_id serve
//      as business keys; is_active recomputes automatically from squad).
//
// Returns a summary: {created, updated, skipped, failed:[{row, reason}]}
//
// Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and the
// caller's session role must be Admin.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const first = clean.split("\n")[0] ?? "";
  const sep = first.includes("\t") ? "\t" : ",";
  return clean
    .split("\n")
    .map((l) => {
      if (sep === "\t") return l.split("\t").map((c) => c.trim());
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (quoted) {
          if (ch === '"') {
            if (l[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
          } else cur += ch;
        } else {
          if (ch === '"') quoted = true;
          else if (ch === ",") { out.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    })
    .filter((r) => r.some((c) => c));
}

function randomPassword(): string {
  return Array.from({ length: 4 })
    .map(() => Math.random().toString(36).slice(2, 10))
    .join("") + "!Aa1";
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((me as any)?.role !== "Admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const sendRecovery = String(form.get("send_recovery") ?? "true") !== "false";
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const text = (bytes[0] === 0xff && bytes[1] === 0xfe)
    ? new TextDecoder("utf-16le").decode(buf)
    : new TextDecoder("utf-8").decode(buf);

  const rows = parseCsv(text);
  if (rows.length < 2) return NextResponse.json({ error: "empty file" }, { status: 400 });

  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  function idx(...names: string[]) {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    return -1;
  }
  const iEmail  = idx("email");
  const iHr     = idx("hr_code", "hr");
  const iFirst  = idx("first_name", "firstname");
  const iLast   = idx("last_name", "lastname");
  const iMobile = idx("mobile_number", "mobile", "phone");
  const iLegacy = idx("legacy_id", "legacyid", "legacy");
  const iSquad  = idx("squad", "team");
  const iTitle  = idx("job_title");

  if (iEmail < 0 || iHr < 0) {
    return NextResponse.json(
      { error: "Missing required columns: email and hr_code" },
      { status: 400 }
    );
  }

  const a = adminClient();
  const failed: { row: number; reason: string }[] = [];
  let created = 0;
  let updated = 0;
  let recoveryEmailsSent = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const email        = (r[iEmail] ?? "").trim().toLowerCase();
    const hr_code      = (r[iHr]    ?? "").trim();
    if (!email || !hr_code) {
      failed.push({ row: i + 1, reason: "missing email or hr_code" });
      continue;
    }
    const first_name    = iFirst  >= 0 ? (r[iFirst]  ?? "").trim() : null;
    const last_name     = iLast   >= 0 ? (r[iLast]   ?? "").trim() : null;
    const mobile_number = iMobile >= 0 ? (r[iMobile] ?? "").trim() : null;
    const legacy_id     = iLegacy >= 0 ? (r[iLegacy] ?? "").trim() : null;
    const squad         = iSquad  >= 0 ? (r[iSquad]  ?? "").trim() : null;
    const job_title         = iTitle  >= 0 ? (r[iTitle]  ?? "").trim() : null;

    // 1) Staging
    await a.from("users_import").insert({
      email, hr_code, first_name, last_name,
      mobile_number, legacy_id, squad, job_title,
    });

    try {
      // 2) auth.users - look up first, then create if missing.
      let authUserId: string | null = null;
      const { data: list } = await a.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      if (existing) {
        authUserId = existing.id;
      } else {
        const { data: ins, error: cErr } = await a.auth.admin.createUser({
          email,
          email_confirm: true,
          password: randomPassword(),
        });
        if (cErr || !ins?.user) throw cErr ?? new Error("createUser failed");
        authUserId = ins.user.id;
        created++;
      }

      // 3) public.users upsert.
      const { error: uErr } = await a
        .from("users")
        .upsert({
          id: authUserId,
          hr_code,
          first_name: first_name || null,
          last_name:  last_name  || null,
          mobile_number: mobile_number || null,
          legacy_id: legacy_id || null,
          squad:     squad || null,
          job_title:     job_title || null,
        }, { onConflict: "id" });
      if (uErr) throw uErr;
      if (!existing) {} else updated++;

      // 4) Password recovery email (optional).
      if (sendRecovery) {
        try {
          await a.auth.admin.generateLink({
            type: "recovery",
            email,
          });
          recoveryEmailsSent++;
        } catch (e: any) {
          failed.push({ row: i + 1, reason: `recovery link: ${e?.message ?? e}` });
        }
      }

      await a.from("users_import").update({ processed_at: new Date().toISOString() })
        .eq("email", email).eq("hr_code", hr_code);
    } catch (e: any) {
      failed.push({ row: i + 1, reason: e?.message ?? String(e) });
      await a.from("users_import")
        .update({ processed_at: new Date().toISOString(), process_error: e?.message ?? String(e) })
        .eq("email", email).eq("hr_code", hr_code);
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    total_rows: rows.length - 1,
    created,
    updated,
    recovery_emails_sent: recoveryEmailsSent,
    failed: failed.slice(0, 25),
    failed_count: failed.length,
  });
}
