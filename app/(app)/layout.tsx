import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar, { type AppRole } from "@/components/Sidebar";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "Viewer") as AppRole;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar email={user.email ?? ""} role={role} />
      <main className="flex-1 min-w-0 px-6 py-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
