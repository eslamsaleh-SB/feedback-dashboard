import { redirect } from "next/navigation";

// /accounts was the pre-v56 role-only editor (queried the dropped `profiles`
// table and a `full_name` column that no longer exists on `users`). It's
// superseded by the full-CRUD /users page - redirect old links/bookmarks
// there instead of maintaining two broken admin UIs in parallel.
export default function AccountsPage() {
  redirect("/users");
}
