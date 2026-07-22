import { NextResponse } from "next/server";

// Scoped out — collector reply-back on inquiries was reverted. Route kept
// as a 404 stub so the folder can be deleted later without breaking any
// stray fetch. Do not build on this.
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
