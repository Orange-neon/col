import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFICULTY_CONFIG } from "./difficulty";
import { loadProblemBank } from "./problemBank";
import {
  BONUS_RANGES,
  explainExample,
  explainSolution,
  getProblemReward,
  scoreProblemComplexity,
} from "./problemProgression";

describe("problem progression and bonuses", () => {
  it("orders every tier from lower to higher estimated complexity", async () => {
    const bank = await loadProblemBank("v2");
    for (const difficulty of DIFFICULTIES) {
      const problems = bank.problems.filter((problem) => problem.difficulty === difficulty);
      expect(problems).toHaveLength(70);
      expect(problems.map((problem) => problem.progressionOrder)).toEqual(
        Array.from({ length: 70 }, (_, index) => index + 1),
      );
      for (let index = 1; index < problems.length; index += 1) {
        expect(scoreProblemComplexity(problems[index])).toBeGreaterThanOrEqual(
          scoreProblemComplexity(problems[index - 1]),
        );
      }
    }
  });

  it("assigns monotonic bonuses spanning each requested range", async () => {
    const bank = await loadProblemBank("v2");
    for (const difficulty of DIFFICULTIES) {
      const bonuses = bank.problems
        .filter((problem) => problem.difficulty === difficulty)
        .map((problem) => problem.bonusPoints!);
      expect(bonuses[0]).toBe(BONUS_RANGES[difficulty].minimum);
      expect(bonuses.at(-1)).toBe(BONUS_RANGES[difficulty].maximum);
      expect([...bonuses].sort((left, right) => left - right)).toEqual(bonuses);
    }
  });

  it("adds the problem bonus to its tier base score", async () => {
    const problem = (await loadProblemBank("v2")).problems.find(
      (item) => item.difficulty === "hard" && item.bonusPoints === 200,
    )!;
    expect(getProblemReward(problem)).toBe(DIFFICULTY_CONFIG.hard.points + 200);
  });

  it("keeps statements concise and explains how each sample reaches its output", async () => {
    for (const version of ["v1", "v2", "v3", "v4", "v5"]) {
      const bank = await loadProblemBank(version);
      for (const problem of bank.problems) {
        expect(problem.description).not.toContain("## What your program needs to do");
        expect(problem.description).not.toContain("### Why this works");
        expect(problem.description).toContain("### Example explained");
        expect(problem.description.indexOf("\n### Example\n")).toBeLessThan(
          problem.description.indexOf("\n### Example explained\n"),
        );
        expect(explainExample(problem).split(/\s+/).length).toBeGreaterThan(8);
        expect(explainExample(problem).split(/\s+/).length).toBeLessThanOrEqual(85);
        expect(explainExample(problem)).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it("substitutes the Fahrenheit sample into the conversion formula", async () => {
    const problem = (await loadProblemBank("v5")).problems.find(
      (item) => item.id === "v5-fahrenheit-workshop",
    )!;
    const explanation = explainExample(problem);

    expect(explanation).toContain("(32°F - 32) × 5/9 = 0°C");
    expect(explanation).toContain("output is `0.0`");
  });

  it("connects representative numeric, conditional, and text samples to their outputs", async () => {
    const problems = (await loadProblemBank("v5")).problems;
    const explanationFor = (id: string) =>
      explainExample(problems.find((item) => item.id === id)!);

    expect(explanationFor("v5-solar-panel-energy")).toContain("4 × 250 × 5 = 5000");
    expect(explanationFor("v5-freezer-safe-zone")).toContain("-20 <= -21 <= -10");
    expect(explanationFor("v5-freezer-safe-zone")).toContain("is false");
    expect(explanationFor("v5-rocket-radio-check")).toContain(
      "Adding `: radio ready.` after it",
    );
  });

  it("uses the authored example even when it is not the first test case", async () => {
    const problem = (await loadProblemBank("v1")).problems.find(
      (item) => item.id === "fibonacci-term",
    )!;

    expect(explainExample(problem)).toContain("`7`");
    expect(explainExample(problem)).toContain("`8`");
  });

  it("explains the actual reason behind representative techniques", async () => {
    const problems = (await loadProblemBank("v5")).problems;
    const explanationFor = (id: string) =>
      explainSolution(problems.find((item) => item.id === id)!);

    expect(explanationFor("even-or-odd")).toContain("remainder 0");
    expect(explanationFor("v5-snack-crate-ceiling")).toContain("leftover snacks");
    expect(explanationFor("v5-trie-autocomplete")).toContain("same prefix");
    expect(explanationFor("v5-lazy-range-minimum")).toContain("Each tree node summarizes one range");
  });
});
