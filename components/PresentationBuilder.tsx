"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Page = {
  header: string;
  description: string;
  video_link: string;
  drive_file_id?: string | null;
};

type CollectorOpt = { hr_code: string; name: string; team: string | null };

type InitialData = {
  id: string;
  title: string;
  description: string;
  google_slides_url: string | null;
  pages: Page[];
  hr_codes: string[];
};

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const s = url.trim();
  const folders = s.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folders) return folders[1];
  const file = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (file) return file[1];
  const idParam = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(s)) return s;
  return null;
}

export default function PresentationBuilder({
  mode,
  collectors,
  initial,
}: {
  mode: "create" | "edit";
  collectors: CollectorOpt[];
  initial: InitialData | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pages, setPages] = useState<Page[]>(
    initial?.pages && initial.pages.length > 0
      ? initial.pages
      : [{ header: "Page 1", description: "", video_link: "" }]
  );
  const [assigned, setAssigned] = useState<Set<string>>(
    new Set(initial?.hr_codes ?? [])
  );
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [exportingSlides, setExportingSlides] = useState(false);

  const filteredCollectors = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return collectors;
    return collectors.filter((c) => {
      const hay = `${c.hr_code} ${c.name} ${c.team ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [collectors, assigneeSearch]);

  function updatePage(i: number, patch: Partial<Page>) {
    setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPage() {
    setPages((prev) => [
      ...prev,
      { header: `Page ${prev.length + 1}`, description: "", video_link: "" },
    ]);
  }
  function removePage(i: number) {
    setPages((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function movePage(i: number, dir: -1 | 1) {
    setPages((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function toggleAssigned(hr: string) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(hr)) next.delete(hr);
      else next.add(hr);
      return next;
    });
  }

  async function save() {
    setMsg(null);
    if (!title.trim()) return setMsg({ type: "err", text: "Title is required." });
    if (pages.length === 0) return setMsg({ type: "err", text: "Add at least one page." });
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        pages: pages.map((p) => ({
          header: p.header.trim(),
          description: p.description.trim(),
          video_link: p.video_link.trim(),
        })),
        hr_codes: Array.from(assigned),
      };
      const url =
        mode === "create"
          ? "/api/admin/presentations"
          : `/api/admin/presentations/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");

      if (mode === "edit") {
        // Also PUT the assignments for edit mode (create route wrote them once).
        await fetch(`/api/admin/presentations/${initial!.id}/assignments`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ hr_codes: Array.from(assigned) }),
        });
      }
      setMsg({ type: "ok", text: "Saved." });
      if (mode === "create" && json.id) {
        router.push(`/admin-presentations/${json.id}`);
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  async function exportToSlides() {
    if (mode === "create") {
      return setMsg({ type: "err", text: "Save the presentation first." });
    }
    setExportingSlides(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/presentations/${initial!.id}/export-slides`,
        { method: "POST", cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Export failed");
      setMsg({ type: "ok", text: `Google Slides created. Opening in a new tab...` });
      window.open(json.url, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "Export failed" });
    } finally {
      setExportingSlides(false);
    }
  }

  async function deletePresentation() {
    if (mode !== "edit") return;
    if (!confirm("Delete this presentation? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/presentations/${initial!.id}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (res.ok) router.push("/admin-presentations");
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {mode === "create" ? "New Presentation" : "Edit Presentation"}
          </h1>
          {initial?.google_slides_url && (
            <a
              href={initial.google_slides_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 underline mt-1 inline-block"
            >
              Open in Google Slides
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" && (
            <button
              type="button"
              onClick={exportToSlides}
              disabled={exportingSlides}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {exportingSlides ? "Exporting..." : "Convert to Google Slides"}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
          </button>
          {mode === "edit" && (
            <button
              type="button"
              onClick={deletePresentation}
              className="rounded-lg border border-red-300 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}

      {/* Metadata */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Formation basics for new collectors"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </div>
      </div>

      {/* Pages */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Pages ({pages.length})
          </h2>
          <button
            type="button"
            onClick={addPage}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            + Add page
          </button>
        </div>
        {pages.map((p, i) => {
          const driveId = extractDriveId(p.video_link);
          return (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Page {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => movePage(i, -1)}
                    disabled={i === 0}
                    className="rounded-md px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => movePage(i, 1)}
                    disabled={i === pages.length - 1}
                    className="rounded-md px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removePage(i)}
                    disabled={pages.length === 1}
                    className="rounded-md px-2 py-1 text-xs border border-red-300 text-red-600 dark:text-red-400 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Header
                </label>
                <input
                  value={p.header}
                  onChange={(e) => updatePage(i, { header: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  value={p.description}
                  onChange={(e) => updatePage(i, { description: e.target.value })}
                  rows={3}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Google Drive video link
                </label>
                <input
                  value={p.video_link}
                  onChange={(e) => updatePage(i, { video_link: e.target.value })}
                  placeholder="https://drive.google.com/file/d/..."
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  The link must be shared as "Anyone with the link".
                </p>
              </div>
              {driveId && (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 px-3 py-1.5 bg-slate-900 text-slate-100 truncate">
                    Preview - drive_file_id: {driveId}
                  </p>
                  <iframe
                    src={`https://drive.google.com/file/d/${driveId}/preview`}
                    className="w-full"
                    style={{ height: "320px" }}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assignees */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Assign to collectors ({assigned.size})
          </h2>
          <input
            value={assigneeSearch}
            onChange={(e) => setAssigneeSearch(e.target.value)}
            placeholder="Search by code / name / team..."
            className="w-64 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
          {filteredCollectors.length === 0 ? (
            <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
              No collectors match "{assigneeSearch}".
            </p>
          ) : (
            filteredCollectors.map((c) => (
              <label
                key={c.hr_code}
                className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={assigned.has(c.hr_code)}
                  onChange={() => toggleAssigned(c.hr_code)}
                  className="h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {c.hr_code} <span className="text-slate-400 dark:text-slate-500">-</span> {c.name}
                  </p>
                  {c.team && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">{c.team}</p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
