import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar, { type AppRole } from "@/components/Sidebar";
import ViewAsBar from "@/components/ViewAsBar";
import { getEffective } from "@/lib/effective";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Note: the old auto-provision-on-first-login block that used to live here
  // is gone. It upserted into `profiles` (renamed to `users` in v56, and the
  // upsert used a `full_name` column that no longer exists there either).
  // It's also unreachable now anyway - public signup returns 410 Gone, so
  // every `users` row is created deliberately via /users or the CSV import,
  // never on first login.

  const eff = await getEffective(supabase);
  if (!eff) redirect("/login");
  const role = eff.profile.role as AppRole;

  let accounts: { id: string; label: string }[] = [];
  if (eff.isAdmin) {
    const { data: profs } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, role, hr_code")
      .order("email");
    accounts = (profs ?? [])
      .filter((p: any) => p.id !== eff.realUserId)
      .map((p: any) => {
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        return {
          id: p.id as string,
          label: `${p.hr_code ? p.hr_code + " " : ""}${fullName || p.email || p.id} - ${p.role}`,
        };
      });
  }

  const sidebarEmail = eff.viewingAs ? eff.viewingAs.label : user.email ?? "";

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar email={sidebarEmail} role={role} />
      <main className="flex-1 min-w-0 px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {eff.isAdmin && <ViewAsBar accounts={accounts} viewingAs={eff.viewingAs} />}
          {children}
        </div>
      </main>
    </div>
  );
}
