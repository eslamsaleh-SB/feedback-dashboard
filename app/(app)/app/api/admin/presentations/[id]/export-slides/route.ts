import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/presentations/[id]/export-slides
// Builds a .pptx with EMBEDDED videos (not just links) using pptxgenjs.
// Videos are streamed from the Drive "anyone with the link" URL, capped
// per-video and per-deck to stay under Vercel serverless response limits.

const PER_VIDEO_CAP = 20 * 1024 * 1024;
const TOTAL_CAP     = 40 * 1024 * 1024;

async function requireReviewer(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["Admin", "Reviewer", "Supervisor"].includes(profile.role)) {
    return { error: "Reviewers only", status: 403 as const };
  }
  return { user };
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "_");
  return (cleaned || "presentation") + ".pptx";
}

type FetchOk = { ok: true; base64: string; mime: string; size: number };
type FetchErr = { ok: false; reason: string };

async function fetchDriveVideo(fileId: string, capBytes: number): Promise<FetchOk | FetchErr> {
  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e: any) {
    return { ok: false, reason: `Network error fetching Drive video: ${e?.message ?? e}` };
  }
  if (!res.ok) return { ok: false, reason: `Drive returned HTTP ${res.status}` };
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (ct.startsWith("text/html")) {
    return { ok: false, reason: "Drive returned an HTML page (file may be too large for direct download or not shared as 'Anyone with the link')" };
  }
  const lenHeader = res.headers.get("content-length");
  const contentLen = lenHeader ? parseInt(lenHeader, 10) : null;
  if (contentLen && contentLen > capBytes) {
    return { ok: false, reason: `Video is ${(contentLen / 1024 / 1024).toFixed(1)}MB, over ${(capBytes / 1024 / 1024).toFixed(0)}MB cap` };
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > capBytes) {
    return { ok: false, reason: `Video is ${(ab.byteLength / 1024 / 1024).toFixed(1)}MB, over ${(capBytes / 1024 / 1024).toFixed(0)}MB cap` };
  }
  const buf = Buffer.from(ab);
  const mime = (ct.split(";")[0] || "video/mp4").trim();
  return { ok: true, base64: buf.toString("base64"), mime, size: buf.byteLength };
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
    // @ts-ignore
    const mod = await import("pptxgenjs");
    PptxGenJS = mod.default ?? mod;
  } catch {
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

  let embeddedTotal = 0;
  const skipped: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const p: any = pages[i];
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    s.addText(p.header || `Page ${i + 1}`, {
      x: 0.5, y: 0.25, w: 9, h: 0.6,
      fontSize: 24, bold: true, color: "0F172A", fontFace: "Calibri",
    });

    let embedded = false;
    let embedError: string | null = null;
    if (p.drive_file_id) {
      const remaining = TOTAL_CAP - embeddedTotal;
      const cap = Math.min(PER_VIDEO_CAP, Math.max(0, remaining));
      if (cap === 0) {
        embedError = `Total video budget of ${(TOTAL_CAP / 1024 / 1024).toFixed(0)}MB reached; embedding as link instead.`;
      } else {
        const r = await fetchDriveVideo(String(p.drive_file_id), cap);
        if (r.ok) {
          try {
            s.addMedia({
              type: "video",
              data: `data:${r.mime};base64,${r.base64}`,
              x: 0.5, y: 1.5, w: 9, h: 3.6,
            });
            embeddedTotal += r.size;
            embedded = true;
          } catch (e: any) {
            embedError = `addMedia failed: ${e?.message ?? String(e)}`;
          }
        } else {
          embedError = r.reason;
        }
      }
    }

    if (embedded) {
      if (p.description) {
        s.addText(String(p.description), {
          x: 0.5, y: 0.9, w: 9, h: 0.55,
          fontSize: 12, color: "334155", fontFace: "Calibri",
          valign: "top",
        });
      }
    } else {
      if (p.description) {
        s.addText(String(p.description), {
          x: 0.5, y: 1.0, w: 9, h: 3.2,
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
          { x: 0.5, y: 4.4, w: 9, h: 0.5, fontSize: 13, fontFace: "Calibri" }
        );
      }
      if (embedError) {
        s.addText(`Video not embedded: ${embedError}`, {
          x: 0.5, y: 4.9, w: 9, h: 0.3,
          fontSize: 10, italic: true, color: "94A3B8", fontFace: "Calibri",
        });
        skipped.push(`Page ${i + 1}: ${embedError}`);
      }
    }

    s.addText(`${i + 1} / ${pages.length}`, {
      x: 8.6, y: 5.2, w: 0.9, h: 0.3,
      fontSize: 10, color: "94A3B8", align: "right", fontFace: "Calibri",
    });
  }

  if (skipped.length > 0) {
    const s = pptx.addSlide();
    s.addText("Videos not embedded", {
      x: 0.5, y: 0.4, w: 9, h: 0.7,
      fontSize: 24, bold: true, color: "0F172A", fontFace: "Calibri",
    });
    s.addText(
      skipped.map((t) => ({ text: `- ${t}\n`, options: { fontSize: 12, color: "334155" } })) as any,
      { x: 0.5, y: 1.2, w: 9, h: 4.5, fontFace: "Calibri", valign: "top" }
    );
  }

  const buf: any = await pptx.write({ outputType: "nodebuffer" });
  const bytes: Buffer =
    buf instanceof Buffer
      ? buf
      : buf?.buffer
      ? Buffer.from(buf.buffer)
      : Buffer.from(buf);

  const filename = sanitizeFilename(pres.title as string);
  const body = new Uint8Array(bytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
      "X-Embedded-Bytes": String(embeddedTotal),
      "X-Skipped-Videos": String(skipped.length),
    },
  });
}
