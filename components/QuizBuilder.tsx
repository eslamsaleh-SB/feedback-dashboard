"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AssignmentPicker from "@/components/AssignmentPicker";

export type QuestionType =
  | "multiple_choice"
  | "checkboxes"
  | "short_answer"
  | "paragraph"
  | "multiple_choice_other";

type Question = {
  question_type: QuestionType;
  prompt: string;
  options: string[];               // for MC/CB/MC_other
  correct_answers: string | string[] | null;
  points: number;
  video_link: string;
  drive_file_id?: string | null;
  required: boolean;
};

type CollectorOpt = { hr_code: string; name: string; team: string | null };

type InitialData = {
  id: string;
  title: string;
  description: string;
  published: boolean;
  // v59: assigned/display date (YYYY-MM-DD). Optional so callers that don't
  // pass it still work.
  assigned_date?: string | null;
  questions: Question[];
  hr_codes: string[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  checkboxes: "Checkboxes",
  short_answer: "Short Answer",
  paragraph: "Paragraph",
  multiple_choice_other: "Multiple Choice + Other",
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

function blankQuestion(): Question {
  return {
    question_type: "multiple_choice",
    prompt: "New question",
    options: ["Option A", "Option B"],
    correct_answers: null,
    points: 1,
    video_link: "",
    required: true,
  };
}

export default function QuizBuilder({
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
  const [published, setPublished] = useState<boolean>(initial?.published ?? false);
  // v59: admin-picked assign date. Defaults to today on new; keeps the
  // existing value on edit.
  const [assignedDate, setAssignedDate] = useState<string>(
    initial?.assigned_date ?? todayIso()
  );
  const [questions, setQuestions] = useState<Question[]>(
    initial?.questions && initial.questions.length > 0 ? initial.questions : [blankQuestion()]
  );
  const [assigned, setAssigned] = useState<Set<string>>(new Set(initial?.hr_codes ?? []));
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const filteredCollectors = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return collectors;
    return collectors.filter((c) => `${c.hr_code} ${c.name} ${c.team ?? ""}`.toLowerCase().includes(q));
  }, [collectors, assigneeSearch]);

  function updateQuestion(i: number, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions((prev) => [...prev, blankQuestion()]);
  }
  function removeQuestion(i: number) {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    setQuestions((prev) => {
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
  function selectAllCollectors() {
    setAssigned(new Set(collectors.map((c) => c.hr_code)));
  }
  function clearAssigned() {
    setAssigned(new Set());
  }

  async function save() {
    setMsg(null);
    if (!title.trim()) return setMsg({ type: "err", text: "Title is required." });
    if (questions.length === 0) return setMsg({ type: "err", text: "Add at least one question." });
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) return setMsg({ type: "err", text: `Question ${i + 1}: prompt is required.` });
      const needsOptions = ["multiple_choice", "checkboxes", "multiple_choice_other"].includes(q.question_type);
      if (needsOptions && q.options.filter((o) => o.trim()).length < 2) {
        return setMsg({ type: "err", text: `Question ${i + 1}: needs at least 2 options.` });
      }
    }

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        published,
        assigned_date: assignedDate,
        questions: questions.map((q) => ({
          ...q,
          drive_file_id: extractDriveId(q.video_link),
        })),
        hr_codes: Array.from(assigned),
      };
      const url = mode === "create" ? "/api/admin/quizzes" : `/api/admin/quizzes/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");

      if (mode === "edit") {
        await fetch(`/api/admin/quizzes/${initial!.id}/assignments`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ hr_codes: Array.from(assigned) }),
        });
      }
      setMsg({
        type: "ok",
        text: json.email_sent ? `Saved. Emailed ${json.email_sent} collectors.` : "Saved.",
      });
      if (mode === "create" && json.id) router.push(`/admin-quizzes/${json.id}`);
      else router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuiz() {
    if (mode !== "edit") return;
    if (!confirm("Delete this quiz and all submissions? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/quizzes/${initial!.id}`, { method: "DELETE", cache: "no-store" });
    if (res.ok) router.push("/admin-quizzes");
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900";
  const smallInputCls =
    "rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">
          {mode === "create" ? "New Quiz" : "Edit Quiz"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Published</span>
          </label>
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
              onClick={deleteQuiz}
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} required />
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
        {/* v59: admin picks the "assigned" date. Shown to collectors so they
            can tell recent assignments from older ones. Defaults to today. */}
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Assign date
          </label>
          <input
            type="date"
            value={assignedDate}
            onChange={(e) => setAssignedDate(e.target.value)}
            className={inputCls}
            required
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Toggle Published to make the quiz visible to assigned collectors. Emails are sent on
          publish + on new assignments (while published).
        </p>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Questions ({questions.length})
          </h2>
          <button
            type="button"
            onClick={addQuestion}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            + Add question
          </button>
        </div>

        {questions.map((q, i) => {
          const driveId = extractDriveId(q.video_link);
          const needsOptions = ["multiple_choice", "checkboxes", "multiple_choice_other"].includes(q.question_type);
          return (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Question {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(i, -1)}
                    disabled={i === 0}
                    className="rounded-md px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                  >&uarr;</button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(i, 1)}
                    disabled={i === questions.length - 1}
                    className="rounded-md px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                  >&darr;</button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    disabled={questions.length === 1}
                    className="rounded-md px-2 py-1 text-xs border border-red-300 text-red-600 dark:text-red-400 disabled:opacity-40"
                  >Remove</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Prompt</label>
                  <input
                    value={q.prompt}
                    onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Type</label>
                  <select
                    value={q.question_type}
                    onChange={(e) => updateQuestion(i, {
                      question_type: e.target.value as QuestionType,
                      correct_answers: null,
                    })}
                    className={smallInputCls + " w-full"}
                  >
                    {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                      <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Points</label>
                  <input
                    type="number"
                    min={0}
                    value={q.points}
                    onChange={(e) => updateQuestion(i, { points: Number(e.target.value) || 0 })}
                    className={smallInputCls + " w-full"}
                  />
                </div>
                <label className="flex items-end gap-2 pb-1 text-sm">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span>Required</span>
                </label>
              </div>

              {needsOptions && (
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Options (one per line)</label>
                  <textarea
                    value={q.options.join("\n")}
                    onChange={(e) => updateQuestion(i, { options: e.target.value.split("\n") })}
                    rows={Math.min(6, Math.max(2, q.options.length))}
                    className={inputCls}
                  />
                  {q.question_type === "multiple_choice_other" && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      An "Other" option with a free-text field is added automatically for takers.
                    </p>
                  )}
                </div>
              )}

              {needsOptions && (
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Correct answer(s) - used for auto-grading
                  </label>
                  {q.question_type === "checkboxes" ? (
                    <div className="space-y-1">
                      {q.options.map((opt) => {
                        const arr = Array.isArray(q.correct_answers) ? q.correct_answers as string[] : [];
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
                                updateQuestion(i, { correct_answers: Array.from(next) });
                              }}
                              className="h-4 w-4"
                            />
                            {opt || <span className="text-slate-400">(empty)</span>}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={typeof q.correct_answers === "string" ? q.correct_answers : ""}
                      onChange={(e) => updateQuestion(i, { correct_answers: e.target.value || null })}
                      className={smallInputCls + " w-full"}
                    >
                      <option value="">(none - manual review)</option>
                      {q.options.filter((o) => o.trim()).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      {q.question_type === "multiple_choice_other" && (
                        <option value="Other">Other</option>
                      )}
                    </select>
                  )}
                </div>
              )}

              {(q.question_type === "short_answer" || q.question_type === "paragraph") && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Text answers are graded manually. Reviewers can award up to {q.points} points on the submission view.
                </p>
              )}

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Optional Google Drive link (shown to takers)
                </label>
                <input
                  value={q.video_link}
                  onChange={(e) => updateQuestion(i, { video_link: e.target.value })}
                  placeholder="https://drive.google.com/file/d/..."
                  className={inputCls}
                />
                {driveId && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 px-3 py-1.5 bg-slate-900 text-slate-100 truncate">
                      Preview - drive_file_id: {driveId}
                    </p>
                    <iframe
                      src={`https://drive.google.com/file/d/${driveId}/preview`}
                      className="w-full"
                      style={{ height: "260px" }}
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assignees - unified picker (All / Teams / Individuals) */}
      <AssignmentPicker
        collectors={collectors}
        value={assigned}
        onChange={setAssigned}
        title="Assign to collectors"
      />
    </div>
  );
}
