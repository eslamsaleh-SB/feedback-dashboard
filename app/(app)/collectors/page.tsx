import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CollectorsManager from "@/components/CollectorsManager";

export const dynamic = "force-dynamic";

export default async function CollectorsPage() {
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

  if (profile?.role !== "Admin") redirect("/dashboard");

  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name")
    .order("name");

  return <CollectorsManager initial={collectors ?? []} />;
}
