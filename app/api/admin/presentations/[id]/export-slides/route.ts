import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";
export const maxDuration = 60;

// SETUP (Google Cloud):
//   1. https://console.cloud.google.com -> create/pick a project.
//   2. APIs & Services -> Library -> enable "Google Slides API" + "Google Drive API".
//   3. Credentials -> Create Credentials -> Service Account (no roles needed).
//   4. On the service account -> Keys -> Add Key -> JSON. Download.
//   5. Set env vars in Vercel:
//        GOOGLE_SERVICE_ACCOUNT_EMAIL = the JSON `client_email`
//        GOOGLE_SERVICE_ACCOUNT_KEY   = the JSON `private_key` (paste as-is; \n escapes are handled)
//        GOOGLE_SLIDES_SHARE_WITH     = optional, comma-separated Google-account emails to grant EDIT access
//   6. Run `npm install` locally then commit package-lock, or Vercel installs it on next deploy.
//
// Every generated deck is also made public via "anyone with the link can view",
// so recipients WITHOUT Google accounts can still open + download the deck.

async function requireReviewer(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Uploader", "Supervisor"].includes(profile.role)) {
    return { error: "Reviewers only", status: 403 as const };
  }
  return { user };
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await handle(_req, params.id);
  } catch (e: any) {
    console.error("[export-slides] uncaught:", e?.message ?? e, e?.stack);
    return NextResponse.json(
      { error: `Export crashed: ${e?.message ?? String(e)}` },
      { status: 500 }
    );
  }
}

async function handle(_req: NextRequest, id: string) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireReviewer(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    return NextResponse.json(
      { error: "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY not set. See setup notes in export-slides/route.ts." },
      { status: 500 }
    );
  }

  const [{ data: pres }, { data: pageRows }] = await Promise.all([
    supabase
      .from("presentations")
      .select("id, title, description")
      .eq("id", id)
      .single(),
    supabase
      .from("presentation_pages")
      .select("page_order, header, description, video_link, drive_file_id")
      .eq("presentation_id", id)
      .order("page_order", { ascending: true }),
  ]);
  if (!pres) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }
  const pages = pageRows ?? [];

  let google: any;
  try {
    // @ts-ignore -- resolves at runtime after `npm install googleapis`.
    google = (await import("googleapis")).google;
  } catch {
    return NextResponse.json(
      { error: "googleapis package not installed. Run `npm install googleapis`." },
      { status: 500 }
    );
  }

  const jwt = new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  const slides = google.slides({ version: "v1", auth: jwt });
  const drive = google.drive({ version: "v3", auth: jwt });

  const createRes = await slides.presentations.create({ requestBody: { title: pres.title } });
  const presentationId = createRes.data.presentationId as string;

  const requests: any[] = [];
  const firstSlideId = createRes.data.slides?.[0]?.objectId;
  if (firstSlideId) requests.push({ deleteObject: { objectId: firstSlideId } });

  requests.push({
    createSlide: {
      objectId: "title_slide",
      slideLayoutReference: { predefinedLayout: "TITLE" },
      placeholderIdMappings: [
        { layoutPlaceholder: { type: "CENTERED_TITLE", index: 0 }, objectId: "title_slide_title" },
        { layoutPlaceholder: { type: "SUBTITLE", index: 0 }, objectId: "title_slide_subtitle" },
      ],
    },
  });
  requests.push({ insertText: { objectId: "title_slide_title", text: pres.title } });
  if (pres.description) {
    requests.push({ insertText: { objectId: "title_slide_subtitle", text: pres.description } });
  }

  pages.forEach((p: any, i: number) => {
    const slideId = `page_${i + 1}`;
    const titleId = `${slideId}_title`;
    const bodyId = `${slideId}_body`;
    requests.push({
      createSlide: {
        objectId: slideId,
        slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        placeholderIdMappings: [
          { layoutPlaceholder: { type: "TITLE", index: 0 }, objectId: titleId },
          { layoutPlaceholder: { type: "BODY", index: 0 }, objectId: bodyId },
        ],
      },
    });
    requests.push({ insertText: { objectId: titleId, text: p.header || `Page ${i + 1}` } });
    const bodyText =
      (p.description ? p.description + "\n\n" : "") +
      (p.video_link ? `Video: ${p.video_link}` : "");
    if (bodyText.trim()) {
      requests.push({ insertText: { objectId: bodyId, text: bodyText } });
    }
  });

  await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });

  try {
    await drive.permissions.create({
      fileId: presentationId,
      requestBody: { type: "anyone", role: "reader" },
    });
  } catch (e: any) {
    console.warn(`[export-slides] anyone-with-link share failed:`, e?.message ?? e);
  }

  const shareWith = (process.env.GOOGLE_SLIDES_SHARE_WITH || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const emailAddress of shareWith) {
    try {
      await drive.permissions.create({
        fileId: presentationId,
        requestBody: { type: "user", role: "writer", emailAddress },
        sendNotificationEmail: false,
      });
    } catch (e: any) {
      console.warn(`[export-slides] share to ${emailAddress} failed:`, e?.message ?? e);
    }
  }

  const url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  await supabase.from("presentations").update({ google_slides_url: url }).eq("id", id);
  return NextResponse.json({ ok: true, url });
}
