import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getEffective } from "@/lib/effective";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "presentation-videos";

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function requireAdmin() {
  const supabase = createClient();
  const eff = await getEffective(supabase);
  return !!eff?.profile && eff.profile.role === "Admin";
}

const validId = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]+$/.test(s);

// GET ?drive_ids=a,b,c -> { copied: string[] }  (which videos are already in storage)
export async function GET(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const ids = (req.nextUrl.searchParams.get("drive_ids") ?? "")
    .split(",")
    .filter(validId);
  if (ids.length === 0) return NextResponse.json({ copied: [] });

  const { data: files } = await admin().storage.from(BUCKET).list("", { limit: 1000 });
  const have = new Set((files ?? []).map((f) => f.name.split(".")[0]));
  return NextResponse.json({ copied: ids.filter((id) => have.has(id)) });
}

// POST { drive_id, ext } -> { path, token }  signed upload URL (browser uploads directly,
// so large videos don't pass through Vercel's request-size limit).
export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const driveId = body?.drive_id;
  let ext = String(body?.ext ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!validId(driveId)) return NextResponse.json({ error: "Bad drive_id" }, { status: 400 });
  if (!ext || ext.length > 5) ext = "mp4";

  const a = admin();
  // Remove any older copy with a different extension.
  const { data: old } = await a.storage.from(BUCKET).list("", { search: driveId, limit: 10 });
  const stale = (old ?? []).map((f) => f.name).filter((n) => n.startsWith(driveId + "."));
  if (stale.length) await a.storage.from(BUCKET).remove(stale);

  const path = `${driveId}.${ext}`;
  const { data, error } = await a.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 400 });
  return NextResponse.json({ path: data.path, token: data.token });
}
