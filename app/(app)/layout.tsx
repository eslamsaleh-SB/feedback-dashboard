import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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

  // Self-heal: ensure a profile row exists for the real user (created UNLINKED;
  // an Admin assigns the collector on the Users page).
  const { data: meCheck } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!meCheck && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = typeof meta.full_name === "string" ? meta.full_name : null;
    await admin
      .from("profiles")
      .upsert(
        { id: user.id, email: user.email ?? null, full_name: fullName, role: "Viewer" },
        { onConflict: "id" }
      );
  }

  const eff = await getEffective(supabase);
  if (!eff) redirect("/login");
  const role = eff.profile.role as AppRole;

  // Account list for the Admin "View as" picker.
  let accounts: { id: string; label: string }[] = [];
  if (eff.isAdmin) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, hr_code")
      .order("email");
    accounts = (profs ?? [])
      .filter((p: any) => p.id !== eff.realUserId)
      .map((p: any) => ({
        id: p.id as string,
        label: `${p.hr_code ? p.hr_code + " " : ""}${p.full_name ?? p.email ?? p.id} · ${p.role}`,
      }));
  }

  const sidebarEmail = eff.viewingAs ? eff.viewingAs.label : user.email ?? "";

  return (
    <div className="min-h-screen flex bg-slate-50">
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
