import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import FeedbackReservationForm from "@/components/FeedbackReservationForm";

export const dynamic = "force-dynamic";

export default async function FeedbackReservationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  const role = (profile?.role ?? "Viewer") as "Admin" | "Reviewer" | "Viewer";
  if (role === "Viewer") redirect("/analytics");

  const { data: usersDirRaw } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name, squad")
    .not("hr_code", "is", null)
    .order("hr_code");

  const opts = (usersDirRaw ?? []).map((u: any) => ({
    hr_code: u.hr_code as string,
    name: ([u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null) as string | null,
    team: (u.squad ?? null) as string | null,
  }));

  return <FeedbackReservationForm collectors={opts} />;
}
