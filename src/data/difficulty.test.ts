import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFICULTY_CONFIG } from "./difficulty";

describe("difficulty scoring", () => {
  it("awards 100, 450, and 900 points by tier", () => {
    expect(DIFFICULTY_CONFIG.easy.points).toBe(100);
    expect(DIFFICULTY_CONFIG.medium.points).toBe(450);
    expect(DIFFICULTY_CONFIG.hard.points).toBe(900);
  });

  it("uses the same 50-point give-up cost for every tier", () => {
    expect(DIFFICULTIES.map((difficulty) => DIFFICULTY_CONFIG[difficulty].penalty)).toEqual([
      50,
      50,
      50,
    ]);
  });
});
