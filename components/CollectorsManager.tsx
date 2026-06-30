"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Combobox, { type ComboOption } from "@/components/Combobox";

export type Collector = {
  id: string;
  name: string;
  hr_code: string | null;
  team: string | null;
};

const NO_TEAM = "__noteam__";

// Real name = a name that isn't just the HR code.
const hasName = (c: Collector) => !!c.name && c.name !== c.hr_code;

export default function CollectorsManager({
  initial,
  teams,
}: {
  initial: Collector[];
  teams: string[];
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Collector[]>(initial);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; hr: string; team: string }>({
    name: "",
    hr: "",
    team: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const teamOptions = useMemo(() => {
    const s = new Set<string>(teams);
    items.forEach((c) => c.team && s.add(c.team));
    return Array.from(s).sort();
  }, [teams, items]);

  const teamComboOptions: ComboOption[] = useMemo(
    () => [
      { value: "", label: "All teams" },
      { value: NO_TEAM, label: "(No team)" },
      ...teamOptions.map((t) => ({ value: t, label: t })),
    ],
    [teamOptions]
  );

  const codeComboOptions: ComboOption[] = useMemo(
    () => [
      { value: "", label: "All codes" },
      ...[...items]
        .filter((c) => c.hr_code)
        .sort((a, b) => (a.hr_code ?? "").localeCompare(b.hr_code ?? ""))
        .map((c) => ({
          value: c.hr_code as string,
          label: hasName(c) ? `${c.hr_code} - ${c.name}` : (c.hr_code as string),
        })),
    ],
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (q) {
        const hay = `${c.hr_code ?? ""} ${c.name ?? ""} ${c.team ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (codeFilter && c.hr_code !== codeFilter) return false;
      if (teamFilter) {
        if (teamFilter === NO_TEAM) {
          if (c.team) return false;
        } else if ((c.team ?? "") !== teamFilter) return false;
      }
      return true;
    });
  }, [items, search, codeFilter, teamFilter]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("collectors")
      .insert({ name: name.trim() })
      .select("id, name, hr_code, team")
      .single();
    if (!error && data) {
      setItems((p) => [...p, data as Collector].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } else if (error) {
      setMsg(error.message);
    }
    setBusy(false);
  }

  function startEdit(c: Collector) {
    setEditingId(c.id);
    setDraft({ name: hasName(c) ? c.name : "", hr: c.hr_code ?? "", team: c.team ?? "" });
    setMsg(null);
  }

  async function save(c: Collector) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_update_collector", {
      p_id: c.id,
      p_name: draft.name,
      p_hr: draft.hr,
      p_team: draft.team,
    });
    if (error) {
      setMsg(error.message);
    } else {
      setItems((p) =>
        p
          .map((x) =>
            x.id === c.id
              ? {
                  ...x,
                  name: draft.name.trim() || x.name,
                  hr_code: draft.hr.trim() || null,
                  team: draft.team.trim() || null,
                }
              : x
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    }
    setBusy(false);
  }

  async function remove(c: Collector) {
    if (!confirm(`Delete "${c.name}"? This also deletes their sessions.`)) return;
    const { error } = await supabase.from("collectors").delete().eq("id", c.id);
    if (error) return setMsg(error.message);
    setItems((p) => p.filter((x) => x.id !== c.id));
  }

  const inputCls = "rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-slate-900";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Collectors</h1>

      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={add} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collector name"
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-slate-900 text-white px-4 font-medium disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <div className="w-52">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Filter by team</label>
          <Combobox
            options={teamComboOptions}
            value={teamFilter}
            onChange={setTeamFilter}
            placeholder="All teams"
          />
        </div>
        <div className="w-60">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Filter by code</label>
          <Combobox
            options={codeComboOptions}
            value={codeFilter}
            onChange={setCodeFilter}
            placeholder="All codes"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code / name / team..."
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 w-full"
          />
        </div>
        {(teamFilter || codeFilter || search) && (
          <button
            type="button"
            onClick={() => {
              setTeamFilter("");
              setCodeFilter("");
              setSearch("");
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Clear
          </button>
        )}
        <span className="text-sm text-slate-500 dark:text-slate-400 pb-2">{filtered.length} collector(s)</span>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Code</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Name</th>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Team</th>
              <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-slate-500 dark:text-slate-400">
                  No collectors.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const editing = editingId === c.id;
              return (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {editing ? (
                      <input
                        value={draft.hr}
                        onChange={(e) => setDraft((d) => ({ ...d, hr: e.target.value }))}
                        placeholder="HR code"
                        className={`${inputCls} w-28`}
                      />
                    ) : (
                      <span className="font-medium text-slate-800 dark:text-slate-100">{c.hr_code ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing ? (
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Name"
                        className={`${inputCls} w-56`}
                      />
                    ) : hasName(c) ? (
                      c.name
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">- no name -</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing ? (
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
                      <span className={c.team ? "text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}>
                        {c.team ?? "- no team -"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {editing ? (
                      <div className="flex gap-3 justify-end text-sm">
                        <button
                          onClick={() => save(c)}
                          disabled={busy}
                          className="text-emerald-700 hover:text-emerald-900 font-medium disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-slate-500 dark:text-slate-400 hover:text-slate-800">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end text-sm">
                        <button onClick={() => startEdit(c)} className="text-slate-600 dark:text-slate-300 hover:text-slate-900">
                          Edit
                        </button>
                        <button onClick={() => remove(c)} className="text-red-600 hover:text-red-800">
                          Delete
                        </button>
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
        Changing a collector&rsquo;s <span className="font-medium">Code</span> updates it
        everywhere (profile, mistakes, reports, feedback) so their data stays linked.
      </p>
    </div>
  );
}
