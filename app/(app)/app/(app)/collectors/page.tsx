import { redirect } from "next/navigation";

// /collectors was the legacy roster editor bound directly to the
// `collectors` table (its own id/name/team CRUD). Identity now lives on
// `users` (managed at /users) - redirect old links/bookmarks there instead
// of maintaining a second, increasingly stale admin surface.
export default function CollectorsPage() {
  redirect("/users");
}
