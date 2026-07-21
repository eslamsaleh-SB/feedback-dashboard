import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole =
  | "Admin" | "Reviewer" | "Viewer" | "TeamLeader" | "Supervisor" | "QualityLeader";

export type EffProfile = {
  id: string;
  role: AppRole;
  hr_code: string | null;
  collector_id: string | null; // deprecated - v56 dropped users.collector_id; kept null for type compat
  team: string | null; // sourced from users.squad
  full_name: string | null; // derived from first_name + last_name
  email: string | null;
};

export type Effective = {
  realUserId: string;
  realRole: AppRole;
  isAdmin: boolean;
  viewingAs: { id: string; role: AppRole; label: string } | null;
  profile: EffProfile; // effective profile (target when impersonating, else self)
};

export const VIEW_AS_COOKIE = "view_as";
// v57 fix: `profiles` was renamed to `users` back in v56 and this file never
// got updated - every lookup here silently failed and fell back to role
// "Viewer", which is why Admins were being treated as Collectors app-wide.
const SEL = "id, role, hr_code, first_name, last_name, squad, email";

function toProfile(row: any, fallbackId: string, fallbackEmail: string | null): EffProfile {
  const fullName = row ? [row.first_name, row.last_name].filter(Boolean).join(" ").trim() : "";
  return {
    id: (row?.id as string) ?? fallbackId,
    role: ((row?.role as AppRole) ?? "Viewer"),
    hr_code: row?.hr_code ?? null,
    collector_id: null,
    team: row?.squad ?? null,
    full_name: fullName || null,
    email: row?.email ?? fallbackEmail,
  };
}

// Resolves the EFFECTIVE profile for the current request. If the signed-in user
// is an Admin and a `view_as` cookie points at another profile, returns that
// target's profile (read-only preview). Otherwise returns the real profile.
export async function getEffective(
  supabase: SupabaseClient
): Promise<Effective | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: meRow } = await supabase.from("users").select(SEL).eq("id", user.id).single();
  const me = toProfile(meRow, user.id, user.email ?? null);
  const isAdmin = me.role === "Admin";

  let viewingAs: Effective["viewingAs"] = null;
  let profile = me;

  const target = cookies().get(VIEW_AS_COOKIE)?.value;
  if (isAdmin && target && target !== user.id) {
    const { data: tRow } = await supabase.from("users").select(SEL).eq("id", target).single();
    if (tRow) {
      profile = toProfile(tRow, target, null);
      const code = profile.hr_code ? `${profile.hr_code} ` : "";
      viewingAs = {
        id: profile.id,
        role: profile.role,
        label: `${code}${profile.full_name ?? profile.email ?? ""}`.trim() || profile.id,
      };
    }
  }

  return { realUserId: user.id, realRole: me.role, isAdmin, viewingAs, profile };
}

// True while an Admin is previewing as someone else — used to block writes.
export function isViewingAs(): boolean {
  return !!cookies().get(VIEW_AS_COOKIE)?.value;
}
