"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MSOption = { value: string; label: string };

/**
 * v59: shared multi-select with checkboxes + Apply.
 *
 * - `values` is the CURRENTLY applied selection.
 * - Internal `draft` state holds pending picks while the popover is open.
 * - "Apply" commits the draft to `onApply`. Cancel / click-outside reverts.
 * - Empty selection is treated as "All" by convention (parent decides).
 */
export default function MultiSelectCombobox({
  options,
  values,
  onApply,
  placeholder = "All",
  className = "",
  disabled = false,
  showSearch = true,
}: {
  options: MSOption[];
  values: string[];
  onApply: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  showSearch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set(values));
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Re-sync draft with committed values whenever the popover opens or the
    // committed selection changes externally.
    if (open) setDraft(new Set(values));
  }, [open, values]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(value: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function selectAll() {
    setDraft(new Set(filtered.map((o) => o.value)));
  }
  function clearAll() {
    setDraft(new Set());
  }
  function apply() {
    onApply(Array.from(draft));
    setOpen(false);
  }
  function cancel() {
    setDraft(new Set(values));
    setOpen(false);
  }

  const buttonLabel = (() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      const o = options.find((x) => x.value === values[0]);
      return o?.label ?? values[0];
    }
    return `${values.length} selected`;
  })();

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-left text-sm flex items-center justify-between gap-2 disabled:opacity-50"
      >
        <span className="truncate text-slate-700 dark:text-slate-200">
          {buttonLabel}
        </span>
        <span className="text-slate-400" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 max-w-[90vw] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {showSearch && (
            <div className="p-2 border-b border-slate-200 dark:border-slate-800">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
              />
            </div>
          )}
          <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <button type="button" onClick={selectAll} className="hover:underline">
              Select all
            </button>
            <span>{draft.size} picked</span>
            <button type="button" onClick={clearAll} className="hover:underline">
              Clear
            </button>
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">No matches</li>
            ) : (
              filtered.map((o) => {
                const checked = draft.has(o.value);
                return (
                  <li key={o.value}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(o.value)}
                        className="h-4 w-4"
                      />
                      <span className="text-slate-700 dark:text-slate-200 truncate">
                        {o.label}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-2 py-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-md bg-slate-900 text-white px-3 py-1 text-xs font-medium hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
