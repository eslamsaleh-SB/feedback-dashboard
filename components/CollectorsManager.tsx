"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Collector = {
  id: string;
  name: string;
  hr_code: string | null;
  team: string | null;
};

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
  const [noNameOnly, setNoNameOnly] = useState(false);
  const [noTeamOnly, setNoTeamOnly] = useState(false);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (q) {
        const hay = `${c.hr_code ?? ""} ${c.name ?? ""} ${c.team ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (noNameOnly && hasName(c)) return false;
      if (noTeamOnly && c.team) return false;
      return true;
    });
  }, [items, search, noNameOnly, noTeamOnly]);

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

  const inputCls = "rounded-lg border border-slate-300 px-2 py-1 text-sm bg-white";
  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-sm ${
      active ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Collectors</h1>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={add} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collector name"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-slate-900 text-white px-4 font-medium disabled:opacity-50"
          >
            Add
          </button>
        </form>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code / name / team…"
          className="rounded-lg border border-slate-300 px-3 py-2 flex-1 min-w-[200px]"
        />
        <button type="button" onClick={() => setNoNameOnly((v) => !v)} className={chip(noNameOnly)}>
          No name
        </button>
        <button type="button" onClick={() => setNoTeamOnly((v) => !v)} className={chip(noTeamOnly)}>
          No team
        </button>
        <span className="text-sm text-slate-500">{filtered.length} collector(s)</span>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Code</th>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Name</th>
              <th className="text-left font-medium text-slate-500 px-4 py-3">Team</th>
              <th className="text-right font-medium text-slate-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-slate-500">
                  No collectors.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const editing = editingId === c.id;
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {editing ? (
                      <input
                        value={draft.hr}
                        onChange={(e) => setDraft((d) => ({ ...d, hr: e.target.value }))}
                        placeholder="HR code"
                        className={`${inputCls} w-28`}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{c.hr_code ?? "—"}</span>
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
                      <span className="text-slate-400">— no name —</span>
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
                      <span className={c.team ? "text-slate-600" : "text-slate-400"}>
                        {c.team ?? "— no team —"}
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
                        <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-800">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end text-sm">
                        <button onClick={() => startEdit(c)} className="text-slate-600 hover:text-slate-900">
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

      <p className="text-xs text-slate-400">
        Changing a collector's <span className="font-medium">Code</span> updates it
        everywhere (profile, mistakes, reports, feedback) so their data stays linked.
      </p>
    </div>
  );
}
