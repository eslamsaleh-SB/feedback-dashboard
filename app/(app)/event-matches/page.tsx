import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import EventMatchesView from "@/components/EventMatchesView";

export const dynamic = "force-dynamic";

export default async function EventMatchesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (!profile || !["Admin", "Reviewer", "Supervisor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const { data: usersRows } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .not("hr_code", "is", null)
    .order("hr_code");
  const collectors = (usersRows ?? []).map((u: any) => ({
    hr_code: u.hr_code as string,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.hr_code as string),
    team: (u.squad ?? null) as string | null,
  }));

  return <EventMatchesView collectors={collectors} />;
}
