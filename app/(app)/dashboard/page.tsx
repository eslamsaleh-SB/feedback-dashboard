import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The standalone "Dashboard" page has been consolidated:
//   - Collectors get their "My Dashboard" at /analytics
//   - Admins/Uploaders get "Collectors Performance" at /analytics
// so /dashboard simply forwards there (and is no longer shown to Admins).
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  redirect("/analytics");
}
