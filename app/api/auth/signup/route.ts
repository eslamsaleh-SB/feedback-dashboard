// v56 - Public signup is disabled. All accounts are created by an Admin via
// /admin/users. Old bookmarks / clients hitting this endpoint get 410 Gone.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Public sign-up is disabled. Contact your Admin to have an account created for you.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json({ error: "gone" }, { status: 410 });
}
