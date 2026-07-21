"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Question = {
  id: string;
  question_order: number;
  question_type: string;
  prompt: string;
  options: string[] | null;
  points: number;
  video_link: string | null;
  drive_file_id: string | null;
  required: boolean;
};

type Answer = {
  answer_text?: string | null;
  selected_options?: string[] | null;
  other_text?: string | null;
};

export default function QuizTaker({
  quiz,
  questions,
}: {
  quiz: { id: string; title: string; description: string | null };
  questions: Question[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function set(qId: string, a: Answer) {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], ...a } }));
  }

  async function submit() {
    setMsg(null);
    // Validate required.
    for (const q of questions) {
      if (!q.required) continue;
      const a = answers[q.id];
      const hasText = a?.answer_text?.trim() || a?.other_text?.trim();
      const hasOptions = Array.isArray(a?.selected_options) && a!.selected_options!.length > 0;
      if (!hasText && !hasOptions) {
        return setMsg({ type: "err", text: `Question ${q.question_order} is required.` });
      }
    }
    if (!confirm("Submit your quiz? You can only submit once.")) return;
    setBusy(true);
    try {
      const payload = {
        answers: questions.map((q) => ({
          question_id: q.id,
          ...(answers[q.id] ?? {}),
        })),
      };
      const res = await fetch(`/api/quizzes/${quiz.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submit failed");
      setMsg({
        type: "ok",
        text: `Submitted. Auto score: ${json.auto_score} / ${json.max_score}.`,
      });
      setTimeout(() => router.refresh(), 500);
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "Submit failed" });
    } finally {
      setBusy(false);
    }
  }

  const cardCls =
    "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3";
  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/my-quizzes" className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
          &larr; Back to Quizzes
        </Link>
        <h1 className="text-2xl font-bold mt-1">{quiz.title}</h1>
        {quiz.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{quiz.description}</p>
        )}
      </div>

      {questions.map((q) => {
        const a = answers[q.id] ?? {};
        return (
          <div key={q.id} className={cardCls}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {q.question_order}. {q.prompt}
                {q.required && <span className="text-red-500 ml-1">*</span>}
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {q.points} pt{q.points === 1 ? "" : "s"}
              </span>
            </div>

            {/* Answer widgets */}
            {q.question_type === "short_answer" && (
              <input
                value={a.answer_text ?? ""}
                onChange={(e) => set(q.id, { answer_text: e.target.value })}
                className={inputCls}
              />
            )}
            {q.question_type === "paragraph" && (
              <textarea
                value={a.answer_text ?? ""}
                onChange={(e) => set(q.id, { answer_text: e.target.value })}
                rows={4}
                className={inputCls}
              />
            )}
            {q.question_type === "multiple_choice" && (
              <div className="space-y-2">
                {(q.options ?? []).filter((o) => o.trim()).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`q_${q.id}`}
                      checked={(a.selected_options?.[0] ?? "") === opt}
                      onChange={() => set(q.id, { selected_options: [opt] })}
                      className="h-4 w-4"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}
            {q.question_type === "checkboxes" && (
              <div className="space-y-2">
                {(q.options ?? []).filter((o) => o.trim()).map((opt) => {
                  const arr = a.selected_options ?? [];
                  const checked = arr.includes(opt);
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(arr);
                          if (e.target.checked) next.add(opt);
                          else next.delete(opt);
                          set(q.id, { selected_options: Array.from(next) });
                        }}
                        className="h-4 w-4"
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {q.question_type === "multiple_choice_other" && (
              <div className="space-y-2">
                {(q.options ?? []).filter((o) => o.trim()).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`q_${q.id}`}
                      checked={(a.selected_options?.[0] ?? "") === opt}
                      onChange={() => set(q.id, { selected_options: [opt], other_text: null })}
                      className="h-4 w-4"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`q_${q.id}`}
                    checked={(a.selected_options?.[0] ?? "") === "Other"}
                    onChange={() => set(q.id, { selected_options: ["Other"] })}
                    className="h-4 w-4 mt-2"
                  />
                  <div className="flex-1">
                    <p>Other:</p>
                    <input
                      value={a.other_text ?? ""}
                      onChange={(e) => set(q.id, { selected_options: ["Other"], other_text: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </label>
              </div>
            )}

            {/* Embedded video / drive preview */}
            {q.drive_file_id && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <iframe
                  src={`https://drive.google.com/file/d/${q.drive_file_id}/preview`}
                  className="w-full"
                  style={{ height: "300px" }}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        );
      })}

      {msg && (
        <p className={`text-sm ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Submitting..." : "Submit quiz"}
        </button>
      </div>
    </div>
  );
}
