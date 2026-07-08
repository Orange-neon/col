import { describe, expect, it } from "vitest";
import {
  createSoloDeadline,
  getSoloSecondsRemaining,
  SOLO_DURATION_MS,
  SOLO_DURATION_SECONDS,
} from "./soloTimer";

describe("solo sprint timer", () => {
  it("creates an exact five-minute deadline", () => {
    expect(SOLO_DURATION_SECONDS).toBe(300);
    expect(createSoloDeadline(1_000)).toBe(1_000 + SOLO_DURATION_MS);
  });

  it("rounds partial seconds up and never becomes negative", () => {
    expect(getSoloSecondsRemaining(6_000, 1_001)).toBe(5);
    expect(getSoloSecondsRemaining(6_000, 6_001)).toBe(0);
  });
});
