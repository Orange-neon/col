export const PROBLEM_HISTORY_KEY = "col.problem-history.v1";

const MAX_HISTORY_ITEMS = 200;

export function readProblemHistory(storage: Storage = localStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(PROBLEM_HISTORY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

export function rememberProblem(
  history: string[],
  problemId: string,
  limit = MAX_HISTORY_ITEMS,
): string[] {
  return [problemId, ...history.filter((item) => item !== problemId)].slice(0, limit);
}

export function saveProblemHistory(
  history: string[],
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(PROBLEM_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // History is helpful, but the race should keep working if storage is unavailable.
  }
}
