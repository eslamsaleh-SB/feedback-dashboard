import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FeedbackReservationForm from "@/components/FeedbackReservationForm";

export const dynamic = "force-dynamic";

export default async function FeedbackReservationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role ?? "Viewer") as "Admin" | "Uploader" | "Viewer";
  if (role === "Viewer") redirect("/analytics");

  const { data: collectors } = await supabase
    .from("collectors")
    .select("hr_code, name, team")
    .not("hr_code", "is", null)
    .order("name");

  const opts = (collectors ?? []).map((c: any) => ({
    hr_code: c.hr_code as string,
    name: (c.name ?? null) as string | null,
    team: (c.team ?? null) as string | null,
  }));

  return <FeedbackReservationForm collectors={opts} />;
}
