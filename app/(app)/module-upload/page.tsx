import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModuleUploadForm from "@/components/ModuleUploadForm";

export const dynamic = "force-dynamic";

export default async function ModuleUploadPage() {
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

  if (!profile || !["Admin", "Uploader"].includes(profile.role)) {
    redirect("/analytics");
  }

  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name")
    .order("name");

  return <ModuleUploadForm collectors={collectors ?? []} />;
}
