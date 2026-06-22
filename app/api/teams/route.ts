import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(
      `${url}/rest/v1/collectors?select=team&team=not.is.null`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const data: { team: string }[] = res.ok ? await res.json() : [];
    const teams = Array.from(new Set(data.map((r) => r.team).filter(Boolean))).sort();
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [] });
  }
}
