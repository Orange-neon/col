import { describe, expect, it } from "vitest";
import { rememberProblem } from "./problemHistory";

describe("problem history", () => {
  it("keeps the most recently encountered problem first", () => {
    expect(rememberProblem(["beta", "alpha"], "gamma")).toEqual(["gamma", "beta", "alpha"]);
  });

  it("moves repeated problems to the front without duplicates", () => {
    expect(rememberProblem(["beta", "alpha", "gamma"], "alpha")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("trims old entries", () => {
    expect(rememberProblem(["b", "c", "d"], "a", 3)).toEqual(["a", "b", "c"]);
  });
});
