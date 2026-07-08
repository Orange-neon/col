import type { Difficulty } from "./problemTypes";

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; points: number; penalty: number }
> = {
  easy: { label: "Easy", points: 100, penalty: 50 },
  medium: { label: "Medium", points: 450, penalty: 50 },
  hard: { label: "Hard", points: 900, penalty: 50 },
};

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
