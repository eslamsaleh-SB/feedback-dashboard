import { createClient } from "@/lib/supabase/server";
import AnalyticsDashboard, {
  type MatchRow,
  type Mistake,
  MODULES,
} from "@/components/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, collector_id")
    .eq("id", user!.id)
    .single();

  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";

  // RLS scopes every query below to what this user may see:
  //   Admin -> all, Uploader -> own uploads, Viewer -> own collector.
  const [{ data: matches }, { data: collectors }] = await Promise.all([
    supabase
      .from("matches")
      .select("match_id, collector_id, date, collectors(name)")
      .order("date", { ascending: false }),
    supabase.from("collectors").select("id, name").order("name"),
  ]);

  // Pull every module's rows in parallel.
  const moduleResults = await Promise.all(
    MODULES.map((m) =>
      supabase
        .from(m.value)
        .select(
          "id, match_id, key, review_date, description, category, severity, video_timestamp, notes"
        )
    )
  );

  const matchRows: MatchRow[] = (matches ?? []).map((m: any) => ({
    match_id: m.match_id,
    collector_id: m.collector_id,
    collector_name: m.collectors?.name ?? "Unknown",
    date: m.date,
  }));

  const mistakes: Mistake[] = [];
  moduleResults.forEach((res, i) => {
    const moduleValue = MODULES[i].value;
    (res.data ?? []).forEach((r: any) => {
      mistakes.push({
        id: r.id,
        module: moduleValue,
        match_id: r.match_id,
        key: r.key,
        description: r.description,
        category: r.category,
        severity: r.severity,
        video_timestamp: r.video_timestamp,
        notes: r.notes,
      });
    });
  });

  let myName: string | null = null;
  if (role === "Viewer" && profile?.collector_id) {
    myName =
      (collectors ?? []).find((c) => c.id === profile.collector_id)?.name ??
      null;
  }

  return (
    <AnalyticsDashboard
      role={role}
      myName={myName}
      isLinked={role !== "Viewer" || !!profile?.collector_id}
      matches={matchRows}
      mistakes={mistakes}
      collectors={collectors ?? []}
    />
  );
}
