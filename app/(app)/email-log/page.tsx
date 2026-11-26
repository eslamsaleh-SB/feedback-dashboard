import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getEffective } from "@/lib/effective";
import EmailLogView, { type EmailLogRow } from "@/components/EmailLogView";

export const dynamic = "force-dynamic";

// Admin-only: every email the dashboard sent in the last month.
export default async function EmailLogPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  if (!eff?.profile || eff.profile.role !== "Admin") redirect("/dashboard");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Housekeeping: keep one month.
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await admin.from("email_log").delete().lt("created_at", cutoff);

  const rows: EmailLogRow[] = [];
  let error: string | null = null;
  for (let start = 0; start < 50000; start += 1000) {
    const { data, error: e } = await admin
      .from("email_log")
      .select("id, created_at, to_email, cc, subject, status, error, hr_code")
      .order("created_at", { ascending: false })
      .range(start, start + 999);
    if (e) { error = e.message; break; }
    rows.push(...((data ?? []) as EmailLogRow[]));
    if (!data || data.length < 1000) break;
  }

  return <EmailLogView rows={rows} error={error} />;
}
