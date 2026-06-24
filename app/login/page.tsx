"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [hrCode, setHrCode] = useState("");
  const [team, setTeam] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok"|"err"; text: string }|null>(null);

  useEffect(() => {
    // Load the team list once on mount (works in any mode, avoids stale cache).
    fetch("/api/teams", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ teams }: { teams: string[] }) => setTeams(Array.isArray(teams) ? teams : []))
      .catch(() => setTeams([]));
  }, []);

  function switchMode(next: Mode) {
    setMode(next); setMessage(null); setEmail(""); setPassword("");
    setFullName(""); setHrCode(""); setTeam("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMessage(null);
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) return setMessage({ type: "err", text: error.message });
      return setMessage({ type: "ok", text: "Password reset link sent — check your email." });
    }
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setMessage({ type: "err", text: error.message });
      router.replace("/dashboard"); return;
    }
    const code = hrCode.trim().toUpperCase();
    if (!code) { setLoading(false); return setMessage({ type: "err", text: "Enter your HR code." }); }
    if (!/^[AI]-\d+$/.test(code)) {
      setLoading(false);
      return setMessage({ type: "err", text: "HR code must be A-1234 or I-1234 (letter A or I, a dash, then numbers). Don't enter your name." });
    }
    // Sign up through our server route (admin createUser with email_confirm:true).
    // This avoids Supabase's built-in email rate limit that blocks normal signUp().
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        hr_code: code,
        team: team === "__none__" ? null : team || null,
      }),
    });
    const out = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (!res.ok) return setMessage({ type: "err", text: out?.error || "Could not create account." });
    setMessage({ type: "ok", text: "Account created. You can sign in now." });
    switchMode("signin");
  }

  const title = mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password";

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-4">
        <h1 className="text-2xl font-bold text-center">{title}</h1>
        {mode === "signup" && (
          <>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <div>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="HR code (e.g. A-2074)" value={hrCode} onChange={(e) => setHrCode(e.target.value.replace(/\s/g, ""))} required />
              <p className="text-xs text-slate-400 mt-1">Links your account to your data. No spaces.</p>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Team</label>
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                <option value="">-- select your team --</option>
                <option value="__none__">Team Not Listed</option>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </>
        )}
        <input type="email" className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== "forgot" && (
          <input type="password" className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        )}
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-50">
          {loading ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
        </button>
        {message && <p className={`text-sm text-center ${message.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>}
        {mode === "signin" && <button type="button" onClick={() => switchMode("forgot")} className="w-full text-sm text-slate-500 hover:text-slate-800">Forgot password?</button>}
        {mode !== "forgot" ? (
          <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")} className="w-full text-sm text-slate-500 hover:text-slate-800">
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        ) : (
          <button type="button" onClick={() => switchMode("signin")} className="w-full text-sm text-slate-500 hover:text-slate-800">Back to sign in</button>
        )}
      </form>
    </main>
  );
}
