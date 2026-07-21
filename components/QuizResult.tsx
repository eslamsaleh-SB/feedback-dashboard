"use client";

import Link from "next/link";

type Question = {
  id: string;
  question_order: number;
  question_type: string;
  prompt: string;
  options: string[] | null;
  points: number;
};

type Answer = {
  id: string;
  question_id: string;
  answer_text: string | null;
  selected_options: string[] | null;
  other_text: string | null;
  is_correct: boolean | null;
  points_awarded: number;
};

export default function QuizResult({
  quiz,
  submission,
  questions,
  answers,
}: {
  quiz: { id: string; title: string };
  submission: {
    submitted_at: string;
    auto_score: number;
    manual_score: number;
    total_score: number;
    max_score: number;
  };
  questions: Question[];
  answers: Answer[];
}) {
  const byQ = new Map<string, Answer>();
  for (const a of answers) byQ.set(a.question_id, a);

  const pct = submission.max_score > 0
    ? Math.round((submission.total_score / submission.max_score) * 100)
    : 0;

  const cardCls =
    "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/my-quizzes" className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
          &larr; Back to Quizzes
        </Link>
        <h1 className="text-2xl font-bold mt-1">{quiz.title}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Submitted {new Date(submission.submitted_at).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Score</p>
          <p className="text-2xl font-bold text-emerald-600">
            {submission.total_score}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal"> / {submission.max_score}</span>
          </p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Percent</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{pct}%</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Auto-graded</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{submission.auto_score}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Reviewer-graded</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{submission.manual_score}</p>
        </div>
      </div>

      {questions.map((q) => {
        const a = byQ.get(q.id);
        const isText = q.question_type === "short_answer" || q.question_type === "paragraph";
        return (
          <div key={q.id} className={cardCls}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {q.question_order}. {q.prompt}
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {(a?.points_awarded ?? 0)} / {q.points} pts
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Your answer</p>
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
            </div>
            {a?.is_correct === true && (
              <p className="text-xs text-emerald-700">Correct</p>
            )}
            {a?.is_correct === false && (
              <p className="text-xs text-red-600">Incorrect</p>
            )}
            {isText && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Text answers are reviewed manually.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
