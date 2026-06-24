import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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

  let { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Self-heal: a signed-in user with no profile row. This happens when a prior
  // account was deleted at the DB/profile level only (the auth.users row
  // survived), so a later sign-up reused the existing auth row and the
  // handle_new_user trigger never fired. Recreate + link the profile here so
  // the person is usable again and shows up in the Users list.
  if (!profile && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = typeof meta.full_name === "string" ? meta.full_name : null;

    // Create the profile UNLINKED. We deliberately do NOT pull hr_code from the
    // (possibly stale) signup metadata, so a re-registered account never
    // silently re-claims an old code. An Admin assigns the collector on the
    // Users page.
    await admin
      .from("profiles")
      .upsert(
        { id: user.id, email: user.email ?? null, full_name: fullName, role: "Viewer" },
        { onConflict: "id" }
      );

    const reread = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    profile = reread.data;
  }

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
