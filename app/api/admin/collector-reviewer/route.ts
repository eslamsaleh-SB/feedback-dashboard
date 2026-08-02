import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isViewingAs } from "@/lib/effective";

export const runtime = "nodejs";

// v59: manage which reviewer owns each collector. Admin-only.
//
// POST body:
//   { action: "assign", hr_code: "...", reviewer_id: "uuid" }
//     - Closes any open assignment on that collector (end_date = today - 1)
//     - Inserts a new row (start_date = today, end_date = null)
//   { action: "unassign", hr_code: "..." }
//     - Closes the open row without opening a new one.

async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "Admin") {
    return { error: "Admins only", status: 403 as const };
  }
  return { user };
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  if (isViewingAs()) {
    return NextResponse.json({ error: "Read-only in 'View as' mode." }, { status: 403 });
  }
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const action = String(body.action || "");
  const hrCode = String(body.hr_code || "").trim();
  if (!hrCode) {
    return NextResponse.json({ error: "hr_code is required" }, { status: 400 });
  }

  if (action === "unassign") {
    const { error } = await supabase
      .from("collector_reviewer_assignments")
      .update({ end_date: yesterdayIso() })
      .eq("collector_hr_code", hrCode)
      .is("end_date", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "assign") {
    const reviewerId = String(body.reviewer_id || "").trim();
    if (!reviewerId) {
      return NextResponse.json({ error: "reviewer_id is required" }, { status: 400 });
    }
    // Confirm the target user is actually a reviewer (or Admin).
    const { data: reviewer } = await supabase
      .from("users").select("id, role").eq("id", reviewerId).single();
    const role = (reviewer as any)?.role;
    if (!reviewer || !["Reviewer", "Admin", "Supervisor"].includes(role)) {
      return NextResponse.json(
        { error: "Selected user is not a Reviewer / Supervisor / Admin." },
        { status: 400 }
      );
    }

    // Close the currently open assignment (if any).
    const closeErr = await supabase
      .from("collector_reviewer_assignments")
      .update({ end_date: yesterdayIso() })
      .eq("collector_hr_code", hrCode)
      .is("end_date", null);
    if (closeErr.error) {
      return NextResponse.json({ error: closeErr.error.message }, { status: 400 });
    }

    // Open the new one.
    const { error } = await supabase
      .from("collector_reviewer_assignments")
      .insert({
        collector_hr_code: hrCode,
        reviewer_id: reviewerId,
        start_date: todayIso(),
        end_date: null,
        created_by: auth.user.id,
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
