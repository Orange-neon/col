import { selectAdaptiveProblem, type AdaptiveProfile } from "../data/adaptiveLearning";
import type { Difficulty, Problem } from "../data/problemTypes";
import type { RoomPlayer } from "../types/multiplayer";

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getRemainingCounts(
  problems: Problem[],
  solvedIds: Iterable<string>,
): Record<Difficulty, number> {
  const solved = new Set(solvedIds);
  return problems.reduce(
    (counts, problem) => {
      if (!solved.has(problem.id)) counts[problem.difficulty] += 1;
      return counts;
    },
    { easy: 0, medium: 0, hard: 0 } as Record<Difficulty, number>,
  );
}

export function pickUnsolvedProblem(
  problems: Problem[],
  difficulty: Difficulty,
  solvedIds: Iterable<string>,
  profile?: Partial<AdaptiveProfile> | null,
  random: () => number = Math.random,
): Problem | null {
  return selectAdaptiveProblem(problems, difficulty, solvedIds, profile, random);
}

export function sortRoomPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort(
    (a, b) =>
      b.score - a.score ||
      b.correctCount - a.correctCount ||
      (a.lastAcceptedAt ?? Infinity) - (b.lastAcceptedAt ?? Infinity) ||
      a.nickname.localeCompare(b.nickname),
  );
}
