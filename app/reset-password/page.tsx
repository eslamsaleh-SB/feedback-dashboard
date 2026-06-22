"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      return setMessage({ type: "err", text: "Passwords do not match." });
    }
    if (password.length < 6) {
      return setMessage({ type: "err", text: "Password must be at least 6 characters." });
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setMessage({ type: "err", text: error.message });
    setMessage({ type: "ok", text: "Password updated. Redirecting to sign in…" });
    setTimeout(() => router.replace("/login"), 2000);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">Set new password</h1>
        <input
          type="password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
        {message && (
          <p
            className={`text-sm text-center ${
              message.type === "ok" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}
      </form>
    </main>
  );
}
