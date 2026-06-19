"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [hrCode, setHrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setMessage({ type: "err", text: error.message });
      else router.replace("/dashboard");
      setLoading(false);
      return;
    }

    // ---- Sign up ----
    const code = hrCode.trim();
    if (!code) {
      setLoading(false);
      return setMessage({ type: "err", text: "Enter your HR code." });
    }
    if (/\s/.test(code)) {
      setLoading(false);
      return setMessage({
        type: "err",
        text: "HR code cannot contain spaces.",
      });
    }

    // Reject a code that's already linked to an account (friendly pre-check;
    // the database also enforces this).
    const { data: available, error: checkErr } = await supabase.rpc(
      "hr_code_available",
      { p_code: code }
    );
    if (checkErr) {
      setLoading(false);
      return setMessage({ type: "err", text: checkErr.message });
    }
    if (available === false) {
      setLoading(false);
      return setMessage({
        type: "err",
        text: `HR code "${code}" is already registered to another account.`,
      });
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, hr_code: code } },
    });
    if (error) {
      // Trigger raises unique_violation if the code was taken in a race.
      const taken = /already registered|duplicate|unique/i.test(error.message);
      setMessage({
        type: "err",
        text: taken
          ? `HR code "${code}" is already registered to another account.`
          : error.message,
      });
      setLoading(false);
      return;
    }

    setMessage({
      type: "ok",
      text: "Account created and linked to your HR code. You can sign in now.",
    });
    setMode("signin");
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>

        {mode === "signup" && (
          <>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <div>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="HR code (e.g. A-2074)"
                value={hrCode}
                // Trim spaces as the user types so the code is always clean.
                onChange={(e) => setHrCode(e.target.value.replace(/\s/g, ""))}
                autoCapitalize="characters"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                Links your account to your data. No spaces.
              </p>
            </div>
          </>
        )}

        <input
          type="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
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

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
          }}
          className="w-full text-sm text-slate-500 hover:text-slate-800"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
