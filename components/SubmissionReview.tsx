"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Question = {
  id: string;
  question_order: number;
  question_type: string;
  prompt: string;
  options: string[] | null;
  correct_answers: any;
  points: number;
  video_link: string | null;
  drive_file_id: string | null;
};

type Answer = {
  id: string;
  question_id: string;
  answer_text: string | null;
  selected_options: string[] | null;
  other_text: string | null;
  is_correct: boolean | null;
  points_awarded: number;
  reviewer_notes: string | null;
};

export default function SubmissionReview({
  submission,
  questions,
  answers,
}: {
  submission: {
    id: string;
    hr_code: string;
    submitted_at: string;
    auto_score: number;
    manual_score: number;
    total_score: number;
    max_score: number;
  };
  questions: Question[];
  answers: Answer[];
}) {
  const router = useRouter();
  const answerByQ = new Map<string, Answer>();
  for (const a of answers) answerByQ.set(a.question_id, a);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveGrade(answerId: string, patch: {
    points_awarded?: number;
    is_correct?: boolean;
    reviewer_notes?: string;
  }) {
    setSavingId(answerId);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/quizzes/answers/${answerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      setMsg("Saved.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "save failed");
    } finally {
      setSavingId(null);
    }
  }

  const cardCls = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Submitted at</p>
          <p className="text-sm mt-1 font-medium text-slate-800 dark:text-slate-100">
            {new Date(submission.submitted_at).toLocaleString()}
          </p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Auto score</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{submission.auto_score}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Manual score</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{submission.manual_score}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
          <p className="text-2xl font-bold text-emerald-600">
            {submission.total_score}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal"> / {submission.max_score}</span>
          </p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Percent</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {submission.max_score > 0 ? Math.round((submission.total_score / submission.max_score) * 100) : 0}%
          </p>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {questions.map((q) => {
        const a = answerByQ.get(q.id);
        const isText = q.question_type === "short_answer" || q.question_type === "paragraph";
        const correctExpected = q.correct_answers;
        return (
          <div key={q.id} className={cardCls + " space-y-3"}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {q.question_order}. {q.prompt}
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                worth {q.points} pts
              </span>
            </div>

            {q.drive_file_id && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <iframe
                  src={`https://drive.google.com/file/d/${q.drive_file_id}/preview`}
                  className="w-full"
                  style={{ height: "260px" }}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              </div>
            )}

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Collector's answer</p>
              {isText ? (
                <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                  {a?.answer_text?.trim() ? a.answer_text : <span className="text-slate-400">(no answer)</span>}
                </p>
              ) : (
                <ul className="list-disc pl-5 text-slate-800 dark:text-slate-100">
                  {(a?.selected_options ?? []).map((o) => <li key={o}>{o}</li>)}
                  {q.question_type === "multiple_choice_other" && a?.other_text && (
                    <li><em>Other: {a.other_text}</em></li>
                  )}
                </ul>
              )}
              {!isText && correctExpected != null && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Expected: <code>{Array.isArray(correctExpected) ? correctExpected.join(", ") : String(correctExpected)}</code>
                </p>
              )}
              {a?.is_correct === true && (
                <p className="text-xs text-emerald-700 mt-1">Correct - {a.points_awarded} pts</p>
              )}
              {a?.is_correct === false && (
                <p className="text-xs text-red-600 mt-1">Incorrect</p>
              )}
            </div>

            {isText && a && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Points awarded (0 - {q.points})</label>
                  <input
                    type="number"
                    min={0}
                    max={q.points}
                    defaultValue={a.points_awarded}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      saveGrade(a.id, { points_awarded: Math.max(0, Math.min(q.points, v)) });
                    }}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm w-32"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Reviewer notes</label>
                  <textarea
                    defaultValue={a.reviewer_notes ?? ""}
                    onBlur={(e) => saveGrade(a.id, { reviewer_notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                {savingId === a.id && <p className="text-xs text-slate-400">Saving...</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
