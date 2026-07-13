import { NextResponse } from "next/server";

export const runtime = "nodejs";

// This route is deprecated - Google Slides / Drive integration has been
// replaced with a client-side .pptx download (see [id]/export-slides/route.ts).
// Kept as a stub only so old bookmarks return a clean JSON response.

export async function GET() {
  return NextResponse.json({
    ok: false,
    deprecated: true,
    message:
      "Slides diagnostics removed. The presentation feature now exports .pptx directly from the app - no Google service account is used.",
  });
}
