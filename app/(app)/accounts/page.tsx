import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import AccountsManager, { type Account } from "@/components/AccountsManager";
export const dynamic = "force-dynamic";
export default async function AccountsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Admin") redirect("/dashboard");
  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, role, hr_code").order("email");
  const accounts: Account[] = (profiles ?? []).map((p: any) => ({
    id: p.id, email: p.email, full_name: p.full_name, role: p.role, hr_code: p.hr_code,
  }));
  return <AccountsManager accounts={accounts} />;
}
