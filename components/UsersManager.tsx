"use client";

import { useMemo, useState } from "react";
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
  name: string; // real display name, or "" when none on record
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
const roleLabel = (r: AppRole) =>
  ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

const NO_TEAM = "__noteam__";

export default function UsersManager({
  rows,
  teams,
}: {
  rows: UserRow[];
  teams: string[];
}) {
  const supabase = createClient();
  const [items, setItems] = useState<UserRow[]>(rows);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | AppRole>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; hr: string; team: string; role: AppRole }>(
    { name: "", hr: "", team: "", role: "Viewer" }
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    setDraft({ name: r.name, hr: r.hr_code ?? "", team: r.team ?? "", role: r.role });
    setMsg(null);
  }

  async function save(r: UserRow) {
    setBusy(true);
    setMsg(null);
    // 1) Collector fields (name / code / team) via the admin RPC — only when a
    //    collector record is linked (it updates hr_code everywhere too).
    if (r.collectorId) {
      const { error } = await supabase.rpc("admin_update_collector", {
        p_id: r.collectorId,
        p_name: draft.name,
        p_hr: draft.hr,
        p_team: draft.team,
      });
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
    }
    // 2) Account role on the profile, if it changed.
    if (draft.role !== r.role) {
      const { error } = await supabase
        .from("profiles")
        .update({ role: draft.role })
        .eq("id", r.profileId);
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
    }
    setItems((p) =>
      p.map((x) =>
        x.profileId === r.profileId
          ? {
              ...x,
              name: draft.name.trim(),
              hr_code: draft.hr.trim() || x.hr_code,
              team: draft.team.trim() || null,
              role: draft.role,
            }
          : x
      )
    );
    setEditingId(null);
    setBusy(false);
  }

  const inputCls = "rounded-lg border border-slate-300 px-2 py-1 text-sm bg-white";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-slate-500 text-sm mt-1">
          People with a login account. Edit their name, code, team, and role in one place.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <label className="block text-xs text-slate-500 mb-1">Filter by team</label>
          <Combobox
            options={teamCombo}
            value={teamFilter}
            onChange={setTeamFilter}
            placeholder="All teams"
          />
        </div>
        <div className="w-48">
          <label className="block text-xs text-slate-500 mb-1">Filter by role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | AppRole)}
            className="rounded-lg border border-slate-300 px-3 py-2 bg-white w-full"
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code / name / email / team..."
            className="rounded-lg border border-slate-300 px-3 py-2 w-full"
          />
        </div>
        {(teamFilter || roleFilter || search) && (
          <button
            type="button"
            onClick={() => {
              setTeamFilter("");
              setRoleFilter("");
              setSearch("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
        <span className="text-sm text-slate-500 pb-2">{filtered.length} user(s)</span>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

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
              <tr>
                <td colSpan={6} className="p-4 text-slate-500">
                  No users.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const editing = editingId === r.profileId;
              const noCollector = !r.collectorId;
              return (
                <tr key={r.profileId} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {editing && !noCollector ? (
                      <input
                        value={draft.hr}
                        onChange={(e) => setDraft((d) => ({ ...d, hr: e.target.value }))}
                        placeholder="HR code"
                        className={`${inputCls} w-28`}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{r.hr_code ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing && !noCollector ? (
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Name"
                        className={`${inputCls} w-56`}
                      />
                    ) : r.name ? (
                      r.name
                    ) : (
                      <span className="text-slate-400">- no name -</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing && !noCollector ? (
                      <select
                        value={draft.team}
                        onChange={(e) => setDraft((d) => ({ ...d, team: e.target.value }))}
                        className={inputCls}
                      >
                        <option value="">(no team)</option>
                        {teamOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={r.team ? "text-slate-600" : "text-slate-400"}>
                        {r.team ?? "- no team -"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {r.email ?? "(no email)"}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing ? (
                      <select
                        value={draft.role}
                        onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as AppRole }))}
                        className={inputCls}
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                        {roleLabel(r.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {editing ? (
                      <div className="flex gap-3 justify-end text-sm">
                        <button
                          onClick={() => save(r)}
                          disabled={busy}
                          className="text-emerald-700 hover:text-emerald-900 font-medium disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(r)}
                        className="text-slate-600 hover:text-slate-900 text-sm"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Changing a user&rsquo;s <span className="font-medium">Code</span> updates it everywhere
        (profile, mistakes, reports, feedback) so their data stays linked.
      </p>
    </div>
  );
}
