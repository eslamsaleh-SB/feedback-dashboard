import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/presentation-video/<drive_file_id>
// Streams a Drive video to any logged-in dashboard user, using a Google
// service account (env GOOGLE_SERVICE_ACCOUNT_JSON). The Drive file/folder must
// be shared (Viewer) with the service account's client_email. Range requests
// are forwarded so the player can seek. Nothing is stored in Supabase.

type SA = { client_email: string; private_key: string };

function loadSA(): SA | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const txt = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(txt);
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let cached: { token: string; exp: number } | null = null;

async function getToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const sig = createSign("RSA-SHA256").update(`${header}.${claim}`).sign(sa.private_key);
  const assertion = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(j.error_description ?? "Token request failed");
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cached.token;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { drive_id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const driveId = decodeURIComponent(params.drive_id);
  if (!/^[A-Za-z0-9_-]+$/.test(driveId))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const sa = loadSA();
  if (!sa) return NextResponse.json({ error: "Drive not configured" }, { status: 500 });

  let token: string;
  try {
    token = await getToken(sa);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Auth failed" }, { status: 500 });
  }

  const range = req.headers.get("range");
  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) } }
  );

  // 404 (not shared / not found) makes the player fall back to the Drive iframe.
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Drive file not available", status: upstream.status },
      { status: upstream.status === 404 || upstream.status === 403 ? 404 : 502 }
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
