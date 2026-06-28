// Single email helper used by every notify route.
//
// All mail is sent through Gmail SMTP (nodemailer + "service: gmail") because
// the project doesn't have a custom domain. To stay aligned with what Gmail
// authenticates, the From address is forced to GMAIL_USER (no fallback to a
// domain we don't own). The optional display name comes from EMAIL_FROM_NAME.
//
// Required env vars:
//   GMAIL_USER             - the Gmail address used to send (also the From)
//   GMAIL_APP_PASSWORD     - Google App Password for that account
//
// Optional env vars:
//   EMAIL_FROM_NAME        - display name in the From: header (default "Hudl Stats Feedback")
//   EMAIL_REPLY_TO         - Reply-To address (default GMAIL_USER)
//   NEXT_PUBLIC_APP_URL    - public app URL used in the footer / CTA fallback

import nodemailer from "nodemailer";

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://feedback-dashboard-7i8h.vercel.app";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  /**
   * Optional plain-text version. If omitted, one is generated from the HTML.
   */
  text?: string;
};

/**
 * Sends an email via Gmail SMTP.
 *
 * - From: address is ALWAYS GMAIL_USER (with EMAIL_FROM_NAME as the display
 *   name). This keeps SPF/DKIM/DMARC alignment intact, which is the main
 *   inbox-placement lever on Gmail.
 * - Always sends both `text` and `html` parts. HTML-only mail is a strong
 *   spam signal on Gmail/Outlook.
 * - Adds a `List-Unsubscribe` header (mailto) so receiving servers know there
 *   is a valid unsubscribe path - this lifts inbox placement even for
 *   transactional mail.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn("[email] GMAIL_USER / GMAIL_APP_PASSWORD not set - email skipped");
    return false;
  }

  const fromName = process.env.EMAIL_FROM_NAME || "Hudl Stats Feedback";
  const from = `"${fromName}" <${user}>`;
  const replyTo = process.env.EMAIL_REPLY_TO || user;

  const plain = (text ?? htmlToText(html)).trim();

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to,
      replyTo,
      subject,
      html,
      text: plain,
      headers: {
        "List-Unsubscribe": `<mailto:${user}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return true;
  } catch (e: any) {
    console.error(`[email] sendMail failed for ${to}: ${e?.message ?? e}`);
    return false;
  }
}

/**
 * Strips HTML down to a plain-text body. Not perfect, but covers the simple
 * templates we render. Routes can pass `text` explicitly if they want more
 * control.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/(p|div|h\d|tr)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type RenderEmailOpts = {
  heading: string;
  intro?: string;
  /** Free-form HTML inserted after the intro, before the CTA. */
  bodyHtml?: string;
  /** Optional plain-text body that should appear in the text/plain alternative
   *  next to bodyHtml. If omitted, the bodyHtml is stripped automatically. */
  bodyText?: string;
  cta?: { label: string; url: string };
  closing?: string;
};

/**
 * Wraps a few semantic pieces in a clean, accessible HTML layout plus a matching
 * plain-text version, with a footer that includes an unsubscribe instruction.
 *
 * Inline styles only (no external CSS) so Gmail / Outlook render consistently.
 */
export function renderEmail(opts: RenderEmailOpts): {
  html: string;
  text: string;
} {
  const orgName = process.env.EMAIL_FROM_NAME || "Hudl Stats Feedback";
  const dashboard = DASHBOARD_URL;
  const { heading, intro, bodyHtml, bodyText, cta, closing } = opts;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;color:#1f2937;line-height:1.55;">
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">${escapeHtml(heading)}</h2>
    ${intro ? `<p style="margin:0 0 12px;color:#374151;">${intro}</p>` : ""}
    ${bodyHtml ?? ""}
    ${
      cta
        ? `<p style="margin:20px 0;"><a href="${cta.url}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(
            cta.label
          )}</a></p>`
        : ""
    }
    ${closing ? `<p style="margin:16px 0 0;color:#374151;">${closing}</p>` : ""}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
    <p style="color:#6b7280;font-size:12px;margin:0;">
      ${escapeHtml(orgName)} - Collector Performance Dashboard<br>
      <a href="${dashboard}" style="color:#6b7280;">${dashboard}</a><br>
      <span style="color:#9ca3af;">This is a transactional message from your reviewer team. To stop receiving these emails, reply with the word "unsubscribe".</span>
    </p>
  </div>
</body></html>`;

  const textLines: string[] = [];
  textLines.push(heading);
  textLines.push("");
  if (intro) textLines.push(stripTags(intro));
  if (intro) textLines.push("");
  if (bodyText) textLines.push(bodyText);
  else if (bodyHtml) textLines.push(htmlToText(bodyHtml));
  if (cta) {
    textLines.push("");
    textLines.push(`${cta.label}: ${cta.url}`);
  }
  if (closing) {
    textLines.push("");
    textLines.push(stripTags(closing));
  }
  textLines.push("");
  textLines.push("---");
  textLines.push(`${orgName} - Collector Performance Dashboard`);
  textLines.push(dashboard);
  textLines.push(`To stop receiving these emails, reply with the word "unsubscribe".`);

  return { html, text: textLines.join("\n") };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
