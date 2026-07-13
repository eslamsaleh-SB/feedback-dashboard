import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/presentations/[id]/export-slides
// Builds a .pptx file server-side with pptxgenjs and streams it back as a download.
// No Google APIs, no service account, no OAuth - the browser saves the file
// and the user can open it in PowerPoint, Keynote, or upload to Google Slides
// themselves.

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

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "_");
  return (cleaned || "presentation") + ".pptx";
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await handle(params.id);
  } catch (e: any) {
    console.error("[export-pptx] uncaught:", e?.message ?? e, e?.stack);
    return NextResponse.json(
      { error: `Export crashed: ${e?.message ?? String(e)}` },
      { status: 500 }
    );
  }
}

async function handle(id: string) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireReviewer(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

  let PptxGenJS: any;
  try {
    // @ts-ignore -- pptxgenjs is a CommonJS package with a default export.
    const mod = await import("pptxgenjs");
    PptxGenJS = mod.default ?? mod;
  } catch (e: any) {
    return NextResponse.json(
      { error: "pptxgenjs not installed. Run `npm install pptxgenjs`." },
      { status: 500 }
    );
  }

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = pres.title as string;
  if (pres.description) pptx.subject = pres.description as string;

  const title = pptx.addSlide();
  title.background = { color: "0F172A" };
  title.addText(pres.title as string, {
    x: 0.5, y: 2.2, w: 9, h: 1.4,
    fontSize: 40, bold: true, color: "FFFFFF",
    align: "center", fontFace: "Calibri",
  });
  if (pres.description) {
    title.addText(pres.description as string, {
      x: 0.5, y: 3.7, w: 9, h: 1.2,
      fontSize: 20, color: "CBD5E1",
      align: "center", fontFace: "Calibri",
    });
  }
  title.addText("Hudl Collector Performance Dashboard", {
    x: 0.5, y: 5.0, w: 9, h: 0.4,
    fontSize: 12, color: "94A3B8",
    align: "center", fontFace: "Calibri",
  });

  pages.forEach((p: any, i: number) => {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    s.addText(p.header || `Page ${i + 1}`, {
      x: 0.5, y: 0.3, w: 9, h: 0.7,
      fontSize: 26, bold: true, color: "0F172A", fontFace: "Calibri",
    });
    if (p.description) {
      s.addText(String(p.description), {
        x: 0.5, y: 1.1, w: 9, h: 3.4,
        fontSize: 16, color: "334155", fontFace: "Calibri",
        valign: "top", paraSpaceAfter: 8,
      });
    }
    if (p.video_link) {
      s.addText(
        [
          { text: "Video: ", options: { bold: true, color: "0F172A" } },
          {
            text: String(p.video_link),
            options: {
              color: "2563EB",
              underline: { style: "sng" } as any,
              hyperlink: { url: String(p.video_link) },
            },
          },
        ] as any,
        { x: 0.5, y: 4.7, w: 9, h: 0.5, fontSize: 14, fontFace: "Calibri" }
      );
    }
    s.addText(`${i + 1} / ${pages.length}`, {
      x: 8.6, y: 5.2, w: 0.9, h: 0.3,
      fontSize: 10, color: "94A3B8", align: "right", fontFace: "Calibri",
    });
  });

  const buf: any = await pptx.write({ outputType: "nodebuffer" });
  const bytes: Buffer =
    buf instanceof Buffer
      ? buf
      : buf?.buffer
      ? Buffer.from(buf.buffer)
      : Buffer.from(buf);

  const filename = sanitizeFilename(pres.title as string);
  // Uint8Array satisfies BodyInit; a raw Node Buffer does not in newer TS lib types.
  const body = new Uint8Array(bytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
