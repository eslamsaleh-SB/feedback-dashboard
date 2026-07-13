"use client";

import Link from "next/link";
import { useState } from "react";

type Page = {
  header: string;
  description: string | null;
  video_link: string | null;
  drive_file_id: string | null;
};

export default function PresentationViewer({
  title,
  description,
  pages,
}: {
  title: string;
  description: string | null;
  pages: Page[];
}) {
  const [idx, setIdx] = useState(0);
  const total = pages.length;
  const page = pages[idx];

  if (total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-slate-500 dark:text-slate-400">This presentation has no pages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link
            href="/my-presentations"
            className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
          >
            &larr; Back to My Presentations
          </Link>
          <h1 className="text-2xl font-bold mt-1">{title}</h1>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
          )}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Page {idx + 1} of {total}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h2 className="text-xl font-semibold">{page.header}</h2>
        {page.description && (
          <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
            {page.description}
          </p>
        )}
        {page.drive_file_id ? (
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <iframe
              src={`https://drive.google.com/file/d/${page.drive_file_id}/preview`}
              className="w-full"
              style={{ height: "480px" }}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
        ) : page.video_link ? (
          <a
            href={page.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            {page.video_link}
          </a>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          Previous
        </button>

        <div className="flex flex-wrap gap-1 justify-center max-w-md">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`w-8 h-8 text-xs font-medium rounded ${
                i === idx
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          disabled={idx === total - 1}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
