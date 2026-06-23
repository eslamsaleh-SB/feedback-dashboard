import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(
      `${url}/rest/v1/collectors?select=team&team=not.is.null`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    const data: { team: string | null }[] = res.ok ? await res.json() : [];

    // Trim, drop blanks, de-duplicate case-insensitively (keep first spelling), sort.
    const seen = new Map<string, string>();
    for (const row of data) {
      const t = (row.team ?? "").trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (!seen.has(k)) seen.set(k, t);
    }
    const teams = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [] });
  }
}
