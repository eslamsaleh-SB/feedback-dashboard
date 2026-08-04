import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import ModuleUploadForm from "@/components/ModuleUploadForm";
import UploadDeleteWidget from "@/components/UploadDeleteWidget";
import { MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function ModuleUploadPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eff = await getEffective(supabase);
  const profile = eff?.profile ?? null;

  // v59: Module upload is Admin-only.
  if (!profile || profile.role !== "Admin") {
    redirect("/analytics");
  }

  // v59: `collectors` is stale/orphaned since v56. ModuleUploadForm only
  // uses hr_code + display name, so shape the users result to match.
  const { data: usersDirRaw } = await supabase
    .from("users")
    .select("hr_code, first_name, last_name")
    .not("hr_code", "is", null)
    .order("hr_code");
  const collectors = (usersDirRaw ?? []).map((u: any) => ({
    id: u.hr_code as string,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.hr_code as string),
  }));

  return (
    <>
      <ModuleUploadForm collectors={collectors} />
      <UploadDeleteWidget
        target="module_totals"
        title="Module Data"
        modules={MODULES.map((m) => ({ value: m.value, label: m.label }))}
      />
    </>
  );
}
