import Editor from "@monaco-editor/react";
import {
  BookOpen,
  Clock3,
  Eye,
  LoaderCircle,
  Radio,
  UserRoundMinus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DIFFICULTY_CONFIG } from "../data/difficulty";
import type { Problem } from "../data/problemTypes";
import type { RaceActivity, RoomPlayer } from "../types/multiplayer";
import { ProblemDescription } from "./ProblemDescription";

interface ParticipantInspectorProps {
  player: RoomPlayer | null;
  problem: Problem | null;
  activity: RaceActivity | null;
  canManage?: boolean;
  onMakeSpectator?: (uid: string) => void | Promise<void>;
}

function formatUpdateTime(updatedAt: number): string {
  if (!Number.isFinite(updatedAt)) return "Update time unavailable";
  return `Updated ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

const difficultyClass = {
  easy: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  hard: "border-rose-400/30 bg-rose-400/10 text-rose-200",
} as const;

export function ParticipantInspector({
  player,
  problem,
  activity,
  canManage = false,
  onMakeSpectator,
}: ParticipantInspectorProps) {
  const [assigning, setAssigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setAssigning(false);
    setActionError(null);
  }, [player?.uid]);

  if (!player) {
    return (
      <section className="panel grid min-h-[32rem] place-items-center p-8 text-center">
        <div className="max-w-xs">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
            <Eye size={27} />
          </div>
          <h2 className="mt-4 text-lg font-black text-white">Select a contestant</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Choose a name on the leaderboard to see their current problem and live code.
          </p>
        </div>
      </section>
    );
  }

  const makeSpectator = async () => {
    if (!onMakeSpectator || assigning) return;
    setAssigning(true);
    setActionError(null);
    try {
      await onMakeSpectator(player.uid);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <section className="panel min-h-[32rem] overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/70 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 shrink-0 rounded-full ${
                player.online ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <h2 className="truncate font-black text-white">{player.nickname}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {player.online ? "Online" : "Offline"} · {player.correctCount} solved · {player.score} points
          </p>
        </div>
        {canManage && onMakeSpectator && (
          <button
            type="button"
            disabled={assigning}
            onClick={() => void makeSpectator()}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-black text-violet-200 transition hover:bg-violet-400/20 disabled:cursor-wait disabled:opacity-50"
          >
            {assigning ? <LoaderCircle size={14} className="animate-spin" /> : <UserRoundMinus size={14} />}
            Make spectator
          </button>
        )}
      </header>

      {actionError && (
        <p className="border-b border-rose-400/20 bg-rose-400/10 px-5 py-2 text-xs text-rose-200" role="alert">
          {actionError}
        </p>
      )}

      {!activity ? (
        <div className="grid min-h-[27rem] place-items-center p-8 text-center">
          <div className="max-w-sm">
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-800/70 text-slate-500">
              <Radio size={23} />
            </div>
            <h3 className="mt-4 font-black text-slate-200">No active problem</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {player.online
                ? "This contestant is choosing their next challenge."
                : "Their live activity is unavailable while they are offline."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-slate-700/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                <BookOpen size={13} /> Current problem
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                <span
                  className={`rounded-full border px-2.5 py-1 ${
                    activity.phase === "active"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  }`}
                >
                  {activity.phase === "active" ? "Editing" : "Pending"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <Clock3 size={12} /> {formatUpdateTime(activity.updatedAt)}
                </span>
              </div>
            </div>

            {problem ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-white">{problem.title}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${difficultyClass[problem.difficulty]}`}
                  >
                    {DIFFICULTY_CONFIG[problem.difficulty].label}
                  </span>
                </div>
                <div className="mt-3 max-h-48 overflow-y-auto pr-2">
                  <ProblemDescription markdown={problem.description} />
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                <h3 className="font-black text-amber-100">Problem unavailable</h3>
                <p className="mt-1 text-xs text-amber-200/70">
                  The live activity references <span className="font-mono">{activity.problemId}</span>,
                  which is not in this room's problem bank.
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#0b1020]">
            <div className="flex h-10 items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                <span className="size-2 rounded-full bg-violet-400" /> solution.py
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
                <Eye size={11} /> Read only
              </span>
            </div>
            <Editor
              height="22rem"
              language="python"
              theme="vs-dark"
              value={activity.source}
              loading={<div className="p-5 text-sm text-slate-500">Loading code viewer…</div>}
              options={{
                readOnly: true,
                domReadOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineHeight: 22,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 14, bottom: 14 },
                renderLineHighlight: "none",
                wordWrap: "on",
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
