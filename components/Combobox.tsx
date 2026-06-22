"use client";

import { useState, useRef, useEffect } from "react";

export type ComboOption = { value: string; label: string };

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
}: {
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setQuery("");
        }}
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-left text-sm flex items-center justify-between gap-2 truncate${disabled ? " opacity-50 cursor-not-allowed" : ""}`}
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="text-slate-400 text-xs shrink-0">&#9660;</span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col max-h-72">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No results</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                    o.value === value ? "font-semibold bg-slate-50" : ""
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
