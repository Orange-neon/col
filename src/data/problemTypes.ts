export type Difficulty = "easy" | "medium" | "hard";

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  description: string;
  starterCode: string;
  solutionCode: string;
  testCases: TestCase[];
  progressionOrder?: number;
  complexityScore?: number;
  bonusPoints?: number;
}

export interface ProblemBank {
  version: string;
  problems: Problem[];
}
