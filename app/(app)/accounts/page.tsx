import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountsManager, { type Account } from "@/components/AccountsManager";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
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

  const [{ data: profiles }, { data: collectors }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, collector_id")
      .order("email"),
    supabase.from("collectors").select("id, name").order("name"),
  ]);

  const accounts: Account[] = (profiles ?? []).map((p: any) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    collector_id: p.collector_id,
  }));

  return <AccountsManager accounts={accounts} collectors={collectors ?? []} />;
}
