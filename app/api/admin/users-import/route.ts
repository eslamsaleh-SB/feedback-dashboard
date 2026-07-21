// POST /api/admin/users-import
// Admin-only bulk onboarding. Accepts EITHER:
//   - multipart file (small CSV, one shot)
//   - application/json body: { rows: [{email, hr_code, ...}, ...], send_recovery? }
// The JSON path is what the admin page uses in 50-row chunks so we never hit
// Vercel's 60s serverless limit.
//
// Perf notes:
//   - We fetch auth.admin.listUsers ONCE at the top and build an email->id map
//     covering the current page. For a 490-user Supabase project this is one
//     HTTP call, not 490.
//   - Batches upserts into public.users_import + public.users.
//   - Recovery emails are optional and, when off, we skip that call entirely.

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

type Row = {
  email: string;
  hr_code: string;
  first_name?: string | null;
  last_name?: string | null;
  mobile_number?: string | null;
  legacy_id?: string | null;
  squad?: string | null;
  job_title?: string | null;
};

function randomPassword(): string {
  return Array.from({ length: 4 })
    .map(() => Math.random().toString(36).slice(2, 10))
    .join("") + "!Aa1";
}

async function loadAllAuthUsers(a: ReturnType<typeof adminClient>) {
  // Paginated list. Supabase caps at 1000/page.
  const map = new Map<string, string>(); // lowercase email -> auth user id
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      const em = (u.email ?? "").toLowerCase();
      if (em) map.set(em, u.id);
    }
    if (users.length < perPage) break;
    page++;
  }
  return map;
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e: any) {
    console.error("[users-import] uncaught:", e?.message ?? e, e?.stack);
    return NextResponse.json(
      { error: `Import crashed: ${e?.message ?? String(e)}` },
      { status: 500 }
    );
  }
}

async function handle(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "Admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  let rows: Row[] = [];
  let sendRecovery = true;

  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "Expected JSON { rows: [...] }" }, { status: 400 });
    }
    rows = body.rows as Row[];
    if (typeof body.send_recovery === "boolean") sendRecovery = body.send_recovery;
  } else {
    // multipart file (small imports only).
    const form = await req.formData();
    const file = form.get("file") as File | null;
    sendRecovery = String(form.get("send_recovery") ?? "true") !== "false";
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const text = (bytes[0] === 0xff && bytes[1] === 0xfe)
      ? new TextDecoder("utf-16le").decode(buf)
      : new TextDecoder("utf-8").decode(buf);
    const parsed = parseCsv(text);
    if (parsed.length < 2) return NextResponse.json({ error: "empty file" }, { status: 400 });

    const headers = parsed[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = headers.findIndex((h) => h === n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const iEmail  = idx("email");
    const iHr     = idx("hr_code", "hr");
    const iFirst  = idx("first_name", "firstname");
    const iLast   = idx("last_name", "lastname");
    const iMobile = idx("mobile_number", "mobile", "phone");
    const iLegacy = idx("legacy_id", "legacyid", "legacy");
    const iSquad  = idx("squad", "team");
    const iTitle  = idx("job_title", "jobtitle", "title");

    if (iEmail < 0 || iHr < 0) {
      return NextResponse.json(
        { error: "Missing required columns: email and hr_code" },
        { status: 400 }
      );
    }
    for (let i = 1; i < parsed.length; i++) {
      const r = parsed[i];
      rows.push({
        email: (r[iEmail] ?? "").trim().toLowerCase(),
        hr_code: (r[iHr] ?? "").trim(),
        first_name: iFirst >= 0 ? (r[iFirst] ?? "").trim() || null : null,
        last_name: iLast >= 0 ? (r[iLast] ?? "").trim() || null : null,
        mobile_number: iMobile >= 0 ? (r[iMobile] ?? "").trim() || null : null,
        legacy_id: iLegacy >= 0 ? (r[iLegacy] ?? "").trim() || null : null,
        squad: iSquad >= 0 ? (r[iSquad] ?? "").trim() || null : null,
        job_title: iTitle >= 0 ? (r[iTitle] ?? "").trim() || null : null,
      });
    }
  }

  const a = adminClient();
  const authByEmail = await loadAllAuthUsers(a);

  const failed: { row: number; email: string; reason: string }[] = [];
  let created = 0;
  let updated = 0;
  let recoveryEmailsSent = 0;
  const usersUpserts: any[] = [];
  const stagingRows: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = (r.email ?? "").toLowerCase().trim();
    const hr    = (r.hr_code ?? "").trim();
    if (!email || !hr) {
      failed.push({ row: i + 1, email, reason: "missing email or hr_code" });
      continue;
    }
    try {
      let authId = authByEmail.get(email);
      if (!authId) {
        const { data: ins, error: cErr } = await a.auth.admin.createUser({
          email,
          email_confirm: true,
          password: randomPassword(),
        });
        if (cErr || !ins?.user) throw cErr ?? new Error("createUser failed");
        authId = ins.user.id;
        authByEmail.set(email, authId);
        created++;
      } else {
        updated++;
      }
      usersUpserts.push({
        id: authId,
        hr_code: hr,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        mobile_number: r.mobile_number || null,
        legacy_id: r.legacy_id || null,
        squad: r.squad || null,
        job_title: r.job_title || null,
      });
      stagingRows.push({
        email, hr_code: hr,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        mobile_number: r.mobile_number || null,
        legacy_id: r.legacy_id || null,
        squad: r.squad || null,
        job_title: r.job_title || null,
        processed_at: new Date().toISOString(),
      });

      if (sendRecovery && created && authByEmail.has(email)) {
        try {
          await a.auth.admin.generateLink({ type: "recovery", email });
          recoveryEmailsSent++;
        } catch (e: any) {
          failed.push({ row: i + 1, email, reason: `recovery: ${e?.message ?? e}` });
        }
      }
    } catch (e: any) {
      failed.push({ row: i + 1, email, reason: e?.message ?? String(e) });
    }
  }

  if (stagingRows.length > 0) {
    // Fire-and-forget staging insert; if it fails don't kill the whole run.
    await a.from("users_import").insert(stagingRows).select("id").limit(1);
  }
  if (usersUpserts.length > 0) {
    const { error: uErr } = await a
      .from("users")
      .upsert(usersUpserts, { onConflict: "id" });
    if (uErr) {
      return NextResponse.json({ error: `users upsert failed: ${uErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    total_rows: rows.length,
    created,
    updated,
    recovery_emails_sent: recoveryEmailsSent,
    failed: failed.slice(0, 25),
    failed_count: failed.length,
  });
}
