import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffective } from "@/lib/effective";
import QuizBuilder from "@/components/QuizBuilder";

export const dynamic = "force-dynamic";

export default async function NewQuizPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const eff = await getEffective(supabase);
  const role = eff?.profile?.role ?? "Viewer";
  if (!["Admin", "Uploader", "Supervisor"].includes(role)) redirect("/my-quizzes");

  const { data: collectors } = await supabase
    .from("collectors")
    .select("hr_code, name, team")
    .not("hr_code", "is", null)
    .order("name");

  return (
    <QuizBuilder
      mode="create"
      collectors={(collectors ?? []).map((c: any) => ({
        hr_code: c.hr_code as string,
        name: (c.name ?? c.hr_code) as string,
        team: (c.team ?? null) as string | null,
      }))}
      initial={null}
    />
  );
}
