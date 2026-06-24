"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Combobox, { type ComboOption } from "@/components/Combobox";

type AppRole =
  | "Admin"
  | "Uploader"
  | "Viewer"
  | "TeamLeader"
  | "Supervisor"
  | "QualityLeader";

export type UserRow = {
  profileId: string;
  email: string | null;
  role: AppRole;
  hr_code: string | null;
  collectorId: string | null;
  name: string;
  team: string | null;
};

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "Uploader", label: "Reviewer" },
  { value: "Viewer", label: "Collector" },
  { value: "TeamLeader", label: "Team Leader" },
  { value: "Supervisor", label: "Supervisor" },
  { value: "QualityLeader", label: "Quality Leader" },
];
const roleLabel = (r: AppRole) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;
const NO_TEAM = "__noteam__";

export default function UsersManager({
  rows,
  teams,
  currentUserId,
}: {
  rows: UserRow[];
  teams: string[];
  currentUserId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<UserRow[]>(rows);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | AppRole>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; hr: string; team: string; role: AppRole; email: string }>(
    { name: "", hr: "", team: "", role: "Viewer", email: "" }
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Add-user form
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState<{ email: string; name: string; hr: string; team: string; role: AppRole }>(
    { email: "", name: "", hr: "", team: "", role: "Viewer" }
  );

  const teamOptions = useMemo(() => {
    const s = new Set<string>(teams);
    items.forEach((r) => r.team && s.add(r.team));
    return Array.from(s).sort();
  }, [teams, items]);

  const teamCombo: ComboOption[] = useMemo(
    () => [
      { value: "", label: "All teams" },
      { value: NO_TEAM, label: "(No team)" },
      ...teamOptions.map((t) => ({ value: t, label: t })),
    ],
    [teamOptions]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (q) {
        const hay = `${r.hr_code ?? ""} ${r.name ?? ""} ${r.email ?? ""} ${r.team ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter && r.role !== roleFilter) return false;
      if (teamFilter) {
        if (teamFilter === NO_TEAM) {
          if (r.team) return false;
        } else if ((r.team ?? "") !== teamFilter) return false;
      }
      return true;
    });
  }, [items, search, teamFilter, roleFilter]);

  function startEdit(r: UserRow) {
    setEditingId(r.profileId);
    setDraft({ name: r.name, hr: r.hr_code ?? "", team: r.team ?? "", role: r.role, email: r.email ?? "" });
    setMsg(null);
    setOk(null);
  }

  async function save(r: UserRow) {
    setBusy(true);
    setMsg(null);
    setOk(null);
    let finalCode = r.hr_code;
    let finalCollectorId = r.collectorId;
    let finalName = draft.name.trim();
    let finalTeam = draft.team.trim() || null;

    const newCode = draft.hr.trim().toUpperCase();
    const codeChanged = !!newCode && newCode !== (r.hr_code ?? "").toUpperCase();

    // 1) Code change = RE-LINK to the existing collector with that code (create
    // it if missing). Never rename another collector, so no "already used" error.
    if (codeChanged) {
      const { data: existing, error: selErr } = await supabase
        .from("collectors")
        .select("id, name, team")
        .eq("hr_code", newCode)
        .maybeSingle();
      if (selErr) { setMsg(selErr.message); setBusy(false); return; }
      let colId: string;
      if (existing) {
        colId = existing.id as string;
        finalName = existing.name && existing.name !== newCode ? (existing.name as string) : "";
        finalTeam = (existing.team as string | null) ?? null;
      } else {
        const ins = await supabase
          .from("collectors")
          .insert({ hr_code: newCode, name: finalName || newCode, team: finalTeam })
          .select("id")
          .single();
        if (ins.error || !ins.data) { setMsg(ins.error?.message || "Could not create collector"); setBusy(false); return; }
        colId = ins.data.id as string;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ hr_code: newCode, collector_id: colId })
        .eq("id", r.profileId);
      if (error) { setMsg(error.message); setBusy(false); return; }
      finalCode = newCode;
      finalCollectorId = colId;
    } else if (r.collectorId) {
      // Code unchanged: just update the linked collector's name/team.
      const { error } = await supabase.rpc("admin_update_collector", {
        p_id: r.collectorId,
        p_name: draft.name,
        p_hr: r.hr_code,
        p_team: draft.team,
      });
      if (error) { setMsg(error.message); setBusy(false); return; }
    }
    // 2) Role.
    if (draft.role !== r.role) {
      const { error } = await supabase.from("profiles").update({ role: draft.role }).eq("id", r.profileId);
      if (error) { setMsg(error.message); setBusy(false); return; }
    }
    // 3) Login email (secure server update).
    const newEmail = draft.email.trim().toLowerCase();
    if (newEmail && newEmail !== (r.email ?? "").toLowerCase()) {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateEmail", profileId: r.profileId, email: newEmail }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || "Could not update email"); setBusy(false); return; }
    }
    setItems((p) =>
      p.map((x) =>
        x.profileId === r.profileId
          ? {
              ...x,
              name: finalName,
              hr_code: finalCode,
              team: finalTeam,
              collectorId: finalCollectorId,
              role: draft.role,
              email: newEmail || x.email,
            }
          : x
      )
    );
    setEditingId(null);
    setBusy(false);
    setOk("Saved.");
  }

  async function remove(r: UserRow) {
    if (!confirm(`Delete the account for ${r.email ?? r.hr_code}? This removes their login. Their collected data stays.`)) return;
    setBusy(true);
    setMsg(null);
    setOk(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", profileId: r.profileId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not delete user"); return; }
    setItems((p) => p.filter((x) => x.profileId !== r.profileId));
    setOk("User deleted.");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setOk(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        email: add.email,
        full_name: add.name,
        hr_code: add.hr,
        team: add.team || null,
        role: add.role,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not create user"); return; }
    setItems((p) => [
      {
        profileId: j.id,
        email: add.email.trim().toLowerCase(),
        role: add.role,
        hr_code: add.hr.trim().toUpperCase(),
        collectorId: j.collectorId ?? null,
        name: add.name.trim(),
        team: add.team || null,
      },
      ...p,
    ]);
    setOk(
      `User created. Temporary password: ${j.tempPassword} — share it with them and have them change it via "Forgot password".`
    );
    setAdd({ email: "", name: "", hr: "", team: "", role: "Viewer" });
    setShowAdd(false);
  }

  const inputCls = "rounded-lg border border-slate-300 px-2 py-1 text-sm bg-white";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-slate-500 text-sm mt-1">
            People with a login account. Edit name, code, team, role, and email — or add / remove users.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd((s) => !s); setMsg(null); setOk(null); }}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium"
        >
          {showAdd ? "Close" : "+ Add user"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={createUser} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="block text-xs text-slate-500 mb-1">Email *</label>
            <input type="email" required value={add.email} onChange={(e) => setAdd((d) => ({ ...d, email: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 w-full" />
          </div>
          <div className="w-40">
            <label className="block text-xs text-slate-500 mb-1">HR code *</label>
            <input required value={add.hr} onChange={(e) => setAdd((d) => ({ ...d, hr: e.target.value.replace(/\s/g, "") }))} placeholder="A-1234" className="rounded-lg border border-slate-300 px-3 py-2 w-full" />
          </div>
          <div className="w-48">
            <label className="block text-xs text-slate-500 mb-1">Full name</label>
            <input value={add.name} onChange={(e) => setAdd((d) => ({ ...d, name: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 w-full" />
          </div>
          <div className="w-44">
            <label className="block text-xs text-slate-500 mb-1">Team</label>
            <select value={add.team} onChange={(e) => setAdd((d) => ({ ...d, team: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 bg-white w-full">
              <option value="">(no team)</option>
              {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="w-40">
            <label className="block text-xs text-slate-500 mb-1">Role</label>
            <select value={add.role} onChange={(e) => setAdd((d) => ({ ...d, role: e.target.value as AppRole }))} className="rounded-lg border border-slate-300 px-3 py-2 bg-white w-full">
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button disabled={busy} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? "Creating..." : "Create user"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <label className="block text-xs text-slate-500 mb-1">Filter by team</label>
          <Combobox options={teamCombo} value={teamFilter} onChange={setTeamFilter} placeholder="All teams" />
        </div>
        <div className="w-48">
          <label className="block text-xs text-slate-500 mb-1">Filter by role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | AppRole)} className="rounded-lg border border-slate-300 px-3 py-2 bg-white w-full">
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code / name / email / team..." className="rounded-lg border border-slate-300 px-3 py-2 w-full" />
        </div>
        {(teamFilter || roleFilter || search) && (
          <button type="button" onClick={() => { setTeamFilter(""); setRoleFilter(""); setSearch(""); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Clear
          </button>
        )}
        <span className="text-sm text-slate-500 pb-2">{filtered.length} user(s)</span>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {ok && <p className="text-sm rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800">{ok}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Code</th>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Name</th>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Team</th>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Email</th>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Role</th>
              <th className="text-right font-medium text-slate-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-slate-500">No users.</td></tr>
            )}
            {filtered.map((r) => {
              const editing = editingId === r.profileId;
              const isSelf = r.profileId === currentUserId;
              const noCollector = !r.collectorId;
              return (
                <tr key={r.profileId} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {editing && !noCollector ? (
                      <input value={draft.hr} onChange={(e) => setDraft((d) => ({ ...d, hr: e.target.value }))} placeholder="HR code" className={`${inputCls} w-28`} />
                    ) : (
                      <span className="font-medium text-slate-800">{r.hr_code ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing && !noCollector ? (
                      <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name" className={`${inputCls} w-48`} />
                    ) : r.name ? (
                      <>
                        {r.name}
                        {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">- no name -{isSelf && <span className="ml-2">(you)</span>}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing && !noCollector ? (
                      <select value={draft.team} onChange={(e) => setDraft((d) => ({ ...d, team: e.target.value }))} className={inputCls}>
                        <option value="">(no team)</option>
                        {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <span className={r.team ? "text-slate-600" : "text-slate-400"}>{r.team ?? "- no team -"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {editing && !isSelf ? (
                      <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} className={`${inputCls} w-56`} />
                    ) : (
                      <span className="text-slate-600">{r.email ?? "(no email)"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing && !isSelf ? (
                      <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as AppRole }))} className={inputCls}>
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{roleLabel(r.role)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {isSelf ? (
                      <span className="text-xs text-slate-400">your account</span>
                    ) : editing ? (
                      <div className="flex gap-3 justify-end text-sm">
                        <button onClick={() => save(r)} disabled={busy} className="text-emerald-700 hover:text-emerald-900 font-medium disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-800">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end text-sm">
                        <button onClick={() => startEdit(r)} className="text-slate-600 hover:text-slate-900">Edit</button>
                        <button onClick={() => remove(r)} disabled={busy} className="text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Changing a user&rsquo;s <span className="font-medium">Code</span> re-points their account to the collector
        with that code (it never renames another collector). Deleting a user removes their login only — their collected data stays.
      </p>
    </div>
  );
}
