import { describe, expect, it } from "vitest";
import type { Problem } from "./problemTypes";
import {
  createAdaptiveProfile,
  selectAdaptiveProblem,
  updateAdaptiveProfile,
} from "./adaptiveLearning";

const problems = Array.from({ length: 30 }, (_, index): Problem => ({
  id: `problem-${index + 1}`,
  title: `Problem ${index + 1}`,
  difficulty: "easy",
  tags: ["test"],
  description: "# Test\n\n## Input\nNone\n\n## Output\nNone\n\n### Example\nNone",
  starterCode: "print()",
  solutionCode: "print()",
  testCases: [{ input: "", expectedOutput: "" }],
  progressionOrder: index + 1,
}));

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

describe("adaptive learning", () => {
  it("randomizes onboarding inside a safe foundational band", () => {
    expect(selectAdaptiveProblem(problems, "easy", [], undefined, () => 0)?.progressionOrder).toBe(1);
    expect(selectAdaptiveProblem(problems, "easy", [], undefined, () => 0.99)?.progressionOrder).toBe(6);
  });

  it("waits for three solves before moving beyond the onboarding band", () => {
    const missesOnly = { ...createAdaptiveProfile(), rating: 1, outcomes: 8, missed: 8 };
    const personalized = { ...missesOnly, rating: 15, solved: 3 };
    expect(selectAdaptiveProblem(problems, "easy", [], missesOnly, () => 0.99)?.progressionOrder).toBe(6);
    expect(selectAdaptiveProblem(problems, "easy", [], personalized, () => 0.99)?.progressionOrder).toBeGreaterThan(6);
  });

  it("raises the skill estimate faster during a success streak", () => {
    let profile = createAdaptiveProfile();
    profile = updateAdaptiveProfile(profile, "solved");
    const afterOne = profile.rating;
    profile = updateAdaptiveProfile(profile, "solved");
    profile = updateAdaptiveProfile(profile, "solved");
    expect(profile.rating).toBeGreaterThan(afterOne + 2);
    expect(profile.streak).toBe(3);
  });

  it("steps back after misses and more strongly after a forfeit", () => {
    const experienced = { ...createAdaptiveProfile(), rating: 15, outcomes: 8, solved: 5, streak: 3 };
    expect(updateAdaptiveProfile(experienced, "missed").rating).toBe(14);
    expect(updateAdaptiveProfile(experienced, "forfeited").rating).toBe(12);
  });

  it("gives stronger students a higher randomized challenge window", () => {
    const lowRandom = seededRandom(42);
    const highRandom = seededRandom(42);
    const low = { ...createAdaptiveProfile(), rating: 5, outcomes: 10, solved: 5 };
    const high = { ...createAdaptiveProfile(), rating: 22, outcomes: 10, solved: 8, streak: 4 };
    const lowAverage = Array.from({ length: 100 }, () =>
      selectAdaptiveProblem(problems, "easy", [], low, lowRandom)!.progressionOrder!,
    ).reduce((sum, order) => sum + order, 0) / 100;
    const highAverage = Array.from({ length: 100 }, () =>
      selectAdaptiveProblem(problems, "easy", [], high, highRandom)!.progressionOrder!,
    ).reduce((sum, order) => sum + order, 0) / 100;
    expect(highAverage).toBeGreaterThan(lowAverage + 10);
  });

  it("never selects solved problems or another difficulty", () => {
    const medium = { ...problems[0], id: "medium", difficulty: "medium" as const };
    const selected = selectAdaptiveProblem(
      [...problems, medium],
      "easy",
      problems.slice(0, 29).map((problem) => problem.id),
      { ...createAdaptiveProfile(), outcomes: 10, solved: 8, rating: 30 },
      () => 0.5,
    );
    expect(selected?.id).toBe("problem-30");
  });
});
