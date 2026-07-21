"use client";

import { useMemo, useState } from "react";
import Combobox, { type ComboOption } from "@/components/Combobox";

type AppRole =
  | "Admin"
  | "Uploader"
  | "Viewer"
  | "TeamLeader"
  | "Supervisor"
  | "QualityLeader";

export type UserRow = {
  id: string;
  email: string | null;
  role: AppRole;
  hr_code: string | null;
  legacy_id: string | null;
  first_name: string | null;
  last_name: string | null;
  mobile_number: string | null;
  squad: string | null;
  job_title: string | null;
  is_active: boolean;
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

type Draft = {
  email: string;
  hr_code: string;
  legacy_id: string;
  first_name: string;
  last_name: string;
  mobile_number: string;
  squad: string;
  job_title: string;
  role: AppRole;
};

const emptyDraft: Draft = {
  email: "", hr_code: "", legacy_id: "", first_name: "", last_name: "",
  mobile_number: "", squad: "", job_title: "", role: "Viewer",
};

export default function UsersManager({
  rows,
  teams,
  currentUserId,
}: {
  rows: UserRow[];
  teams: string[];
  currentUserId: string;
}) {
  const [items, setItems] = useState<UserRow[]>(rows);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | AppRole>("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState<Draft>(emptyDraft);

  const teamOptions = useMemo(() => {
    const s = new Set<string>(teams);
    items.forEach((r) => r.squad && s.add(r.squad));
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
        const hay = `${r.hr_code ?? ""} ${r.legacy_id ?? ""} ${r.first_name ?? ""} ${r.last_name ?? ""} ${r.email ?? ""} ${r.squad ?? ""} ${r.job_title ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter && r.role !== roleFilter) return false;
      if (activeFilter === "active" && !r.is_active) return false;
      if (activeFilter === "inactive" && r.is_active) return false;
      if (teamFilter) {
        if (teamFilter === NO_TEAM) {
          if (r.squad) return false;
        } else if ((r.squad ?? "") !== teamFilter) return false;
      }
      return true;
    });
  }, [items, search, teamFilter, roleFilter, activeFilter]);

  function startEdit(r: UserRow) {
    setEditingId(r.id);
    setDraft({
      email: r.email ?? "",
      hr_code: r.hr_code ?? "",
      legacy_id: r.legacy_id ?? "",
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      mobile_number: r.mobile_number ?? "",
      squad: r.squad ?? "",
      job_title: r.job_title ?? "",
      role: r.role,
    });
    setMsg(null);
    setOk(null);
  }

  async function save(r: UserRow) {
    setBusy(true);
    setMsg(null);
    setOk(null);

    const patch: Record<string, unknown> = {};
    const fields: (keyof Draft)[] = [
      "email", "hr_code", "legacy_id", "first_name", "last_name",
      "mobile_number", "squad", "job_title", "role",
    ];
    for (const f of fields) {
      const before = (r as any)[f] ?? "";
      const after = draft[f];
      if (String(before) !== String(after)) patch[f] = after;
    }
    if (Object.keys(patch).length === 0) {
      setEditingId(null);
      setBusy(false);
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: r.id, patch }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not save changes"); return; }

    setItems((p) =>
      p.map((x) =>
        x.id === r.id
          ? {
              ...x,
              email: draft.email || null,
              hr_code: draft.hr_code || null,
              legacy_id: draft.legacy_id || null,
              first_name: draft.first_name || null,
              last_name: draft.last_name || null,
              mobile_number: draft.mobile_number || null,
              squad: draft.squad || null,
              job_title: draft.job_title || null,
              role: draft.role,
              // is_active is a generated column driven by squad - mirror the
              // same rule client-side so the badge updates without a refetch.
              is_active: !!(draft.squad && draft.squad.trim() && draft.squad.trim().toLowerCase() !== "resigned"),
            }
          : x
      )
    );
    setEditingId(null);
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
      body: JSON.stringify({ action: "delete", id: r.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not delete user"); return; }
    setItems((p) => p.filter((x) => x.id !== r.id));
    setOk("User deleted.");
  }

  async function resetPw(r: UserRow) {
    if (!confirm(`Reset the password for ${r.email ?? r.hr_code}? A new temporary password is generated for you to share — no email is sent.`)) return;
    setBusy(true);
    setMsg(null);
    setOk(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetPassword", id: r.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not reset password"); return; }
    setOk(`New temporary password for ${r.email ?? r.hr_code}: ${j.tempPassword} — share it; they can change it after signing in.`);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setOk(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...add }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not create user"); return; }
    setItems((p) => [
      {
        id: j.id,
        email: add.email.trim().toLowerCase(),
        role: add.role,
        hr_code: add.hr_code.trim() || null,
        legacy_id: add.legacy_id.trim() || null,
        first_name: add.first_name.trim() || null,
        last_name: add.last_name.trim() || null,
        mobile_number: add.mobile_number.trim() || null,
        squad: add.squad.trim() || null,
        job_title: add.job_title.trim() || null,
        is_active: !!(add.squad && add.squad.trim().toLowerCase() !== "resigned"),
      },
      ...p,
    ]);
    setOk(
      `User created. Temporary password: ${j.tempPassword} — share it with them and have them change it via "Forgot password".`
    );
    setAdd(emptyDraft);
    setShowAdd(false);
  }

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-slate-900 w-full";
  const thCls = "text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-3 whitespace-nowrap";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Single source of truth. Every column below is editable — HR code, legacy ID, name,
            mobile, squad, job title, role, and email. Active status follows squad automatically
            (empty or &quot;Resigned&quot; squad = inactive).
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd((s) => !s); setMsg(null); setOk(null); }}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium"
        >
          {showAdd ? "Close" : "+ Add user"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={createUser} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Email *</label>
            <input type="email" required value={add.email} onChange={(e) => setAdd((d) => ({ ...d, email: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">HR code *</label>
            <input required value={add.hr_code} onChange={(e) => setAdd((d) => ({ ...d, hr_code: e.target.value }))} placeholder="A-1234" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Legacy ID</label>
            <input value={add.legacy_id} onChange={(e) => setAdd((d) => ({ ...d, legacy_id: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">First name</label>
            <input value={add.first_name} onChange={(e) => setAdd((d) => ({ ...d, first_name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Last name</label>
            <input value={add.last_name} onChange={(e) => setAdd((d) => ({ ...d, last_name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Mobile</label>
            <input value={add.mobile_number} onChange={(e) => setAdd((d) => ({ ...d, mobile_number: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Squad</label>
            <input value={add.squad} onChange={(e) => setAdd((d) => ({ ...d, squad: e.target.value }))} placeholder="(blank = inactive)" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Job title</label>
            <input value={add.job_title} onChange={(e) => setAdd((d) => ({ ...d, job_title: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Role</label>
            <select value={add.role} onChange={(e) => setAdd((d) => ({ ...d, role: e.target.value as AppRole }))} className={inputCls}>
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button disabled={busy} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 w-full">
              {busy ? "Creating..." : "Create user"}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Filter by squad</label>
          <Combobox options={teamCombo} value={teamFilter} onChange={setTeamFilter} placeholder="All squads" />
        </div>
        <div className="w-48">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Filter by role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | AppRole)} className={inputCls}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="w-40">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
          <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)} className={inputCls}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code / legacy ID / name / email / squad / title..." className={inputCls} />
        </div>
        {(teamFilter || roleFilter || activeFilter || search) && (
          <button type="button" onClick={() => { setTeamFilter(""); setRoleFilter(""); setActiveFilter(""); setSearch(""); }} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            Clear
          </button>
        )}
        <span className="text-sm text-slate-500 dark:text-slate-400 pb-2">{filtered.length} user(s)</span>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {ok && <p className="text-sm rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800">{ok}</p>}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className={thCls}>HR Code</th>
              <th className={thCls}>Legacy ID</th>
              <th className={thCls}>First name</th>
              <th className={thCls}>Last name</th>
              <th className={thCls}>Email</th>
              <th className={thCls}>Mobile</th>
              <th className={thCls}>Squad</th>
              <th className={thCls}>Job title</th>
              <th className={thCls}>Role</th>
              <th className={thCls}>Active</th>
              <th className={`${thCls} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="p-4 text-slate-500 dark:text-slate-400">No users.</td></tr>
            )}
            {filtered.map((r) => {
              const editing = editingId === r.id;
              const isSelf = r.id === currentUserId;
              return (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {editing ? (
                      <input value={draft.hr_code} onChange={(e) => setDraft((d) => ({ ...d, hr_code: e.target.value }))} className={inputCls} />
                    ) : (
                      <span className="font-medium text-slate-800 dark:text-slate-100">{r.hr_code ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {editing ? (
                      <input value={draft.legacy_id} onChange={(e) => setDraft((d) => ({ ...d, legacy_id: e.target.value }))} className={inputCls} />
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">{r.legacy_id ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editing ? (
                      <input value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} className={inputCls} />
                    ) : (
                      <span>{r.first_name ?? <span className="text-slate-400 dark:text-slate-500">-</span>}{isSelf && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(you)</span>}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editing ? (
                      <input value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} className={inputCls} />
                    ) : (
                      <span>{r.last_name ?? <span className="text-slate-400 dark:text-slate-500">-</span>}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {editing ? (
                      <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} className={inputCls} />
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">{r.email ?? "(no email)"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {editing ? (
                      <input value={draft.mobile_number} onChange={(e) => setDraft((d) => ({ ...d, mobile_number: e.target.value }))} className={inputCls} />
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">{r.mobile_number ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editing ? (
                      <input value={draft.squad} onChange={(e) => setDraft((d) => ({ ...d, squad: e.target.value }))} placeholder="(blank = inactive)" className={inputCls} />
                    ) : (
                      <span className={r.squad ? "text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}>{r.squad ?? "- no squad -"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editing ? (
                      <input value={draft.job_title} onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))} className={inputCls} />
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">{r.job_title ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editing ? (
                      <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as AppRole }))} className={inputCls}>
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium whitespace-nowrap">{roleLabel(r.role)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.is_active
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                      }`}
                      title="Derived from squad - not directly editable"
                    >
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {editing ? (
                      <div className="flex gap-3 justify-end text-sm">
                        <button onClick={() => save(r)} disabled={busy} className="text-emerald-700 hover:text-emerald-900 font-medium disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-500 dark:text-slate-400 hover:text-slate-800">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end text-sm">
                        <button onClick={() => startEdit(r)} className="text-slate-600 dark:text-slate-300 hover:text-slate-900">Edit</button>
                        <button onClick={() => resetPw(r)} disabled={busy || isSelf} className="text-blue-600 hover:text-blue-800 disabled:opacity-50">Reset PW</button>
                        <button onClick={() => remove(r)} disabled={busy || isSelf} className="text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        <span className="font-medium">Active</span> is computed automatically from <span className="font-medium">Squad</span> -
        clear the squad or set it to &quot;Resigned&quot; to deactivate someone; they&rsquo;re signed out on their next request.
        Deleting a user removes their login only.
      </p>
    </div>
  );
}
