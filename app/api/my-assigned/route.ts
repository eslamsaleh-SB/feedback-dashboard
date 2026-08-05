import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v59: returns the hr_codes currently (end_date IS NULL) assigned to the
// caller as a reviewer. Used by dashboard pages to power an "Only my
// assigned collectors" toggle. Anyone (even a Viewer) may call; the query
// filters by auth.uid() so no other reviewer's list is exposed.

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ hr_codes: [] });

  const { data, error } = await supabase
    .from("collector_reviewer_assignments")
    .select("collector_hr_code")
    .eq("reviewer_id", user.id)
    .is("end_date", null);
  if (error) {
    return NextResponse.json({ hr_codes: [], error: error.message }, { status: 200 });
  }
  const codes = Array.from(new Set((data ?? []).map((r: any) => r.collector_hr_code as string).filter(Boolean)));
  return NextResponse.json({ hr_codes: codes });
}
