import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import UsersManager, { type UserRow } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

// v57: reads straight from `users` - the single source of truth. No more
// join against `profiles` (renamed away in v56, this page never got updated)
// or `collectors` (being phased out). That stale join is why every column
// on this page rendered blank.

export default async function UsersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;
  if (profile?.role !== "Admin") redirect("/dashboard");

  const { data: users } = await supabase
    .from("users")
    .select(
      "id, email, role, hr_code, legacy_id, first_name, last_name, mobile_number, squad, job_title, is_active"
    )
    .order("hr_code");

  const teams = Array.from(
    new Set((users ?? []).map((u: any) => u.squad).filter(Boolean) as string[])
  ).sort();

  const rows: UserRow[] = (users ?? []).map((u: any) => ({
    id: u.id,
    email: u.email ?? null,
    role: u.role,
    hr_code: u.hr_code ?? null,
    legacy_id: u.legacy_id ?? null,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
    mobile_number: u.mobile_number ?? null,
    squad: u.squad ?? null,
    job_title: u.job_title ?? null,
    is_active: !!u.is_active,
  }));

  return <UsersManager rows={rows} teams={teams} currentUserId={user.id} />;
}
