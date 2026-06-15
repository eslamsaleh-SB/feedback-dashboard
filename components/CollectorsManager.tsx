"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Collector = { id: string; name: string };

export default function CollectorsManager({ initial }: { initial: Collector[] }) {
  const supabase = createClient();
  const [items, setItems] = useState<Collector[]>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("collectors")
      .insert({ name: name.trim() })
      .select()
      .single();
    if (!error && data) {
      setItems((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } else if (error) {
      alert(error.message);
    }
    setBusy(false);
  }

  async function rename(c: Collector) {
    const next = prompt("New name:", c.name);
    if (!next || next === c.name) return;
    const { error } = await supabase
      .from("collectors")
      .update({ name: next })
      .eq("id", c.id);
    if (error) return alert(error.message);
    setItems((p) => p.map((x) => (x.id === c.id ? { ...x, name: next } : x)));
  }

  async function remove(c: Collector) {
    if (!confirm(`Delete "${c.name}"? This also deletes their sessions.`)) return;
    const { error } = await supabase.from("collectors").delete().eq("id", c.id);
    if (error) return alert(error.message);
    setItems((p) => p.filter((x) => x.id !== c.id));
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Collectors</h1>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New collector name"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <button
          disabled={busy}
          className="rounded-lg bg-slate-900 text-white px-4 font-medium disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <ul className="bg-white rounded-2xl border border-slate-200 divide-y">
        {items.length === 0 && (
          <li className="p-4 text-slate-500 text-sm">No collectors yet.</li>
        )}
        {items.map((c) => (
          <li key={c.id} className="p-4 flex items-center justify-between">
            <span>{c.name}</span>
            <div className="flex gap-3 text-sm">
              <button onClick={() => rename(c)} className="text-slate-600 hover:text-slate-900">
                Edit
              </button>
              <button onClick={() => remove(c)} className="text-red-600 hover:text-red-800">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
