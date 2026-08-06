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

  return <EventMatchesView />;
}
