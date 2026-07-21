// Shared helper: send "you've been assigned a presentation" email to
// collectors identified by hr_code. Uses the service-role admin client to
// resolve hr_code -> auth.users.email (RLS-safe path used across the app).

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

export type PresentationAssignmentEmailResult = {
  attempted: number;
  sent: number;
  failed: string[];
};

export async function notifyPresentationAssignees(params: {
  hrCodes: string[];
  presentationId: string;
  presentationTitle: string;
}): Promise<PresentationAssignmentEmailResult> {
  const result: PresentationAssignmentEmailResult = {
    attempted: 0,
    sent: 0,
    failed: [],
  };
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

  const viewerUrl = `${DASHBOARD_URL}/my-presentations/${params.presentationId}`;

  for (const hr of codes) {
    result.attempted++;
    const uid = idByCode.get(hr);
    if (!uid) {
      result.failed.push(hr);
      continue;
    }
    const {
      data: { user },
    } = await a.auth.admin.getUserById(uid);
    const email = user?.email;
    if (!email) {
      result.failed.push(hr);
      continue;
    }

    const { html, text } = renderEmail({
      heading: `New presentation assigned: ${params.presentationTitle}`,
      intro: `You have been assigned a new presentation on the Collector Performance Dashboard.`,
      bodyHtml: `<p style="margin:0 0 12px;color:#374151;">Open the dashboard to review the material. Each page walks you through a short lesson and a linked video.</p>`,
      cta: { label: "Open presentation", url: viewerUrl },
      closing: "Sign in to the dashboard whenever you are ready.",
    });

    const ok = await sendEmail({
      to: email,
      subject: `New presentation assigned: ${params.presentationTitle}`,
      html,
      text,
    });
    if (ok) result.sent++;
    else result.failed.push(hr);
  }

  return result;
}
