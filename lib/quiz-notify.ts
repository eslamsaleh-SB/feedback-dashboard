// Send "you've been assigned a quiz" email to each hr_code.
// Mirrors lib/presentation-notify.ts.

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendEmail, renderEmail } from "@/lib/email";

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export type QuizAssignmentEmailResult = {
  attempted: number;
  sent: number;
  failed: string[];
};

export async function notifyQuizAssignees(params: {
  hrCodes: string[];
  quizId: string;
  quizTitle: string;
  reason?: "assigned" | "reminder";
}): Promise<QuizAssignmentEmailResult> {
  const result: QuizAssignmentEmailResult = { attempted: 0, sent: 0, failed: [] };
  const codes = Array.from(new Set(params.hrCodes.filter(Boolean)));
  if (codes.length === 0) return result;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return result;

  const a = adminClient();
  const { data: profiles, error: profErr } = await a
    .from("users")
    .select("id, hr_code")
    .in("hr_code", codes);
  if (profErr || !profiles) {
    result.failed.push(...codes);
    return result;
  }
  const idByCode = new Map<string, string>();
  for (const p of profiles as { id: string; hr_code: string }[]) {
    if (p?.hr_code && p?.id) idByCode.set(p.hr_code, p.id);
  }

  const takerUrl = `${DASHBOARD_URL}/my-quizzes/${params.quizId}`;
  const isReminder = params.reason === "reminder";

  for (const hr of codes) {
    result.attempted++;
    const uid = idByCode.get(hr);
    if (!uid) { result.failed.push(hr); continue; }
    const { data: { user } } = await a.auth.admin.getUserById(uid);
    const email = user?.email;
    if (!email) { result.failed.push(hr); continue; }

    const { html, text } = renderEmail({
      heading: isReminder
        ? `Reminder: complete the quiz - ${params.quizTitle}`
        : `New quiz assigned: ${params.quizTitle}`,
      intro: isReminder
        ? `You have not yet completed this quiz on the Collector Performance Dashboard.`
        : `You have been assigned a new quiz on the Collector Performance Dashboard.`,
      bodyHtml: `<p style="margin:0 0 12px;color:#374151;">Open the dashboard to take the quiz. Once submitted you'll see your score.</p>`,
      cta: { label: "Take the quiz", url: takerUrl },
      closing: "Sign in to the dashboard whenever you are ready.",
    });

    const ok = await sendEmail({
      to: email,
      subject: isReminder
        ? `Reminder: complete the quiz - ${params.quizTitle}`
        : `New quiz assigned: ${params.quizTitle}`,
      html,
      text,
    });
    if (ok) result.sent++;
    else result.failed.push(hr);
  }

  // Best-effort: stamp last_notified_at on each assignment.
  try {
    await a
      .from("quiz_assignments")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("quiz_id", params.quizId)
      .in("hr_code", codes);
  } catch {}

  return result;
}
