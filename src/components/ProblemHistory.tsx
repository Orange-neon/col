import { BookOpen, CheckCircle2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DIFFICULTY_CONFIG } from "../data/difficulty";
import { getProblemReward } from "../data/problemProgression";
import type { Problem } from "../data/problemTypes";
import { ProblemDescription } from "./ProblemDescription";

interface ProblemHistoryProps {
  problems: Problem[];
  historyIds: string[];
  activeProblemId?: string | null;
  solvedIds: string[];
}

const difficultyStyles: Record<Problem["difficulty"], string> = {
  easy: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  hard: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

function searchableText(problem: Problem): string {
  return [
    problem.title,
    problem.difficulty,
    problem.tags.join(" "),
    problem.description,
    problem.id,
  ].join(" ").toLowerCase();
}

function statusLabel(problem: Problem, activeProblemId: string | null | undefined, solved: Set<string>) {
  if (problem.id === activeProblemId) return "Active";
  if (solved.has(problem.id)) return "Solved";
  return "Opened";
}

function ProblemDetailsDialog({ problem, onClose }: { problem: Problem; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-problem-title"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="panel max-h-[88vh] w-full max-w-3xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/70 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
              Problem history
            </p>
            <h2 id="history-problem-title" className="mt-1 text-xl font-black text-white">
              {problem.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${difficultyStyles[problem.difficulty]}`}>
                {DIFFICULTY_CONFIG[problem.difficulty].label}
              </span>
              <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200">
                +{getProblemReward(problem)}
              </span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close problem"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(88vh-6rem)] overflow-y-auto p-5">
          <ProblemDescription markdown={problem.description} />
          <div className="mt-6">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Public tests
            </h3>
            <div className="mt-3 grid gap-3">
              {problem.testCases.map((testCase, index) => (
                <div key={`${problem.id}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Test {index + 1}
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <pre className="overflow-auto rounded-lg bg-[#050812] p-3 font-mono leading-5 text-slate-300">
                      {testCase.input || "(empty)"}
                    </pre>
                    <pre className="overflow-auto rounded-lg bg-[#050812] p-3 font-mono leading-5 text-emerald-200">
                      {testCase.expectedOutput || "(empty)"}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProblemHistory({
  problems,
  historyIds,
  activeProblemId,
  solvedIds,
}: ProblemHistoryProps) {
  const [query, setQuery] = useState("");
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const solved = useMemo(() => new Set(solvedIds), [solvedIds]);
  const history = useMemo(() => {
    const byId = new Map(problems.map((problem) => [problem.id, problem]));
    return historyIds.flatMap((id) => {
      const problem = byId.get(id);
      return problem ? [problem] : [];
    });
  }, [historyIds, problems]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return history;
    return history.filter((problem) => searchableText(problem).includes(normalized));
  }, [history, query]);

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-700/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            <BookOpen size={15} /> History
          </div>
          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">
            {history.length}
          </span>
        </div>
        <label className="sr-only" htmlFor="problem-history-search">
          Search problem history
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2">
          <Search size={15} className="text-slate-600" />
          <input
            id="problem-history-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search encountered problems"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-700"
          />
        </div>
      </div>
      <div className="max-h-[29rem] overflow-y-auto p-3">
        {!history.length ? (
          <p className="py-12 text-center text-sm text-slate-600">
            Problems you open will appear here.
          </p>
        ) : !filtered.length ? (
          <p className="py-12 text-center text-sm text-slate-600">No matching problems.</p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((problem) => (
              <button
                key={problem.id}
                type="button"
                onClick={() => setSelectedProblem(problem)}
                className="rounded-xl border border-slate-800 bg-slate-950/45 p-3 text-left transition hover:border-sky-400/40 hover:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-white">{problem.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {problem.tags.join(" · ")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${difficultyStyles[problem.difficulty]}`}>
                    {problem.difficulty}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <span>{statusLabel(problem, activeProblemId, solved)}</span>
                  {solved.has(problem.id) && <CheckCircle2 size={14} className="text-emerald-300" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedProblem && (
        <ProblemDetailsDialog
          problem={selectedProblem}
          onClose={() => setSelectedProblem(null)}
        />
      )}
    </section>
  );
}
