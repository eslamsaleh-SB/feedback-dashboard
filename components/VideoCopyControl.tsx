"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** The logged-in dashboard user's email (their Hudl account). */
export function useMyEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => {});
  }, []);
  return email;
}

// Supabase video copies were removed (they used too much Cached Egress).
// Videos are now played only from Google Drive. Kept as a no-op so existing
// imports keep working.
export default function VideoCopyControl(_props: { driveId: string; refreshKey?: number }) {
  return null;
}
