import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsersManager, { type UserRow } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
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

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, hr_code")
    .order("email");

  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, hr_code, name, team");

  const byHr = new Map<string, { id: string; name: string | null; team: string | null }>();
  (collectors ?? []).forEach((c: any) => {
    if (c.hr_code)
      byHr.set(String(c.hr_code).trim().toUpperCase(), {
        id: c.id,
        name: c.name,
        team: c.team ?? null,
      });
  });

  const teams = Array.from(
    new Set((collectors ?? []).map((c: any) => c.team).filter(Boolean) as string[])
  ).sort();

  const rows: UserRow[] = (profiles ?? []).map((p: any) => {
    const c = p.hr_code ? byHr.get(String(p.hr_code).trim().toUpperCase()) : undefined;
    const realName =
      c?.name && c.name !== p.hr_code
        ? c.name
        : p.full_name && p.full_name !== p.hr_code
        ? p.full_name
        : "";
    return {
      profileId: p.id,
      email: p.email,
      role: p.role,
      hr_code: p.hr_code ?? null,
      collectorId: c?.id ?? null,
      name: realName,
      team: c?.team ?? null,
    };
  });

  return <UsersManager rows={rows} teams={teams} />;
}
