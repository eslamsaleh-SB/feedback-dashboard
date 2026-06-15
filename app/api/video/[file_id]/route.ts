import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

// GET /api/video/<file_id>
// 1. Auth-gate the request.
// 2. Ask Telegram getFile for a FRESH file_path (links expire after ~1h).
// 3. Proxy/stream the bytes back to the browser, forwarding Range headers
//    so the HTML5 player can seek.
export async function GET(
  req: NextRequest,
  { params }: { params: { file_id: string } }
) {
  // ---- Auth ----
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const fileId = decodeURIComponent(params.file_id);

  // ---- 1. getFile -> file_path ----
  const getFileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(
      fileId
    )}`
  );
  const getFileJson = await getFileRes.json();

  if (!getFileJson.ok || !getFileJson.result?.file_path) {
    return NextResponse.json(
      { error: "Could not resolve Telegram file", details: getFileJson },
      { status: 404 }
    );
  }

  const filePath = getFileJson.result.file_path as string;
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

  // ---- 2. Stream the file, forwarding Range for seeking ----
  const range = req.headers.get("range");
  const upstream = await fetch(downloadUrl, {
    headers: range ? { Range: range } : {},
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch file from Telegram" },
      { status: 502 }
    );
  }

  // Guess a content-type from the extension Telegram gives us.
  const ext = filePath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "mov"
      ? "video/quicktime"
      : ext === "webm"
      ? "video/webm"
      : "video/mp4";

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=0, no-store");

  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);

  return new NextResponse(upstream.body, {
    status: upstream.status, // 200 or 206 (partial content)
    headers,
  });
}
