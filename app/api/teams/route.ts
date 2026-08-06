import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

// v59: `collectors` was orphaned in v56 (identity moved onto users.squad).
// Reads the live squad values off `public.users` instead. Also returns
// distinct job_titles so the login page + Users admin can share this
// endpoint and stay in sync with the actual data.

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(
      `${url}/rest/v1/users?select=squad,job_title`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    const rows: { squad: string | null; job_title: string | null }[] =
      res.ok ? await res.json() : [];

    // Trim, drop blanks, de-duplicate case-insensitively (keep first spelling), sort.
    const dedupe = (values: (string | null | undefined)[]) => {
      const seen = new Map<string, string>();
      for (const raw of values) {
        const v = (raw ?? "").trim();
        if (!v) continue;
        const k = v.toLowerCase();
        if (!seen.has(k)) seen.set(k, v);
      }
      return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    };

    // v59: seed base lists so newly-created teams/titles show up in the
    // Users admin + login dropdowns even before any user has been assigned
    // to them yet.
    const BASE_TEAMS = ["Operation"];
    const BASE_TITLES = [
      "DC", "Resolution", "Team Leader", "Quality", "Live Quality",
      "Reviewer", "Quality Team Leader", "Collection Team Leader",
      "Operation Team Leader",
    ];

    const teams = dedupe([...BASE_TEAMS, ...rows.map((r) => r.squad)]);
    const titles = dedupe([...BASE_TITLES, ...rows.map((r) => r.job_title)]);
    return NextResponse.json({ teams, titles });
  } catch {
    return NextResponse.json({ teams: [], titles: [] });
  }
}
