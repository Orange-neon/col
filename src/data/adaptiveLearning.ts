import type { Difficulty, Problem } from "./problemTypes";

export type AdaptiveOutcome = "solved" | "missed" | "forfeited";

export interface AdaptiveProfile {
  rating: number;
  outcomes: number;
  solved: number;
  missed: number;
  forfeited: number;
  streak: number;
}

export type AdaptiveProfiles = Record<Difficulty, AdaptiveProfile>;

export function createAdaptiveProfile(): AdaptiveProfile {
  return { rating: 1, outcomes: 0, solved: 0, missed: 0, forfeited: 0, streak: 0 };
}

export function createAdaptiveProfiles(): AdaptiveProfiles {
  return {
    easy: createAdaptiveProfile(),
    medium: createAdaptiveProfile(),
    hard: createAdaptiveProfile(),
  };
}

export function normalizeAdaptiveProfile(profile?: Partial<AdaptiveProfile> | null): AdaptiveProfile {
  const initial = createAdaptiveProfile();
  return {
    rating: Math.max(1, Number(profile?.rating) || initial.rating),
    outcomes: Math.max(0, Number(profile?.outcomes) || 0),
    solved: Math.max(0, Number(profile?.solved) || 0),
    missed: Math.max(0, Number(profile?.missed) || 0),
    forfeited: Math.max(0, Number(profile?.forfeited) || 0),
    streak: Math.max(0, Number(profile?.streak) || 0),
  };
}

export function updateAdaptiveProfile(
  current: Partial<AdaptiveProfile> | null | undefined,
  outcome: AdaptiveOutcome,
): AdaptiveProfile {
  const profile = normalizeAdaptiveProfile(current);
  if (outcome === "solved") {
    const nextStreak = profile.streak + 1;
    const growth = nextStreak >= 4 ? 4 : nextStreak >= 2 ? 3 : 2;
    return {
      ...profile,
      rating: profile.rating + growth,
      outcomes: profile.outcomes + 1,
      solved: profile.solved + 1,
      streak: nextStreak,
    };
  }
  if (outcome === "forfeited") {
    return {
      ...profile,
      rating: Math.max(1, profile.rating - 3),
      outcomes: profile.outcomes + 1,
      forfeited: profile.forfeited + 1,
      streak: 0,
    };
  }
  return {
    ...profile,
    rating: Math.max(1, profile.rating - 1),
    outcomes: profile.outcomes + 1,
    missed: profile.missed + 1,
    streak: 0,
  };
}

function problemOrder(problem: Problem): number {
  return problem.progressionOrder ?? Number.MAX_SAFE_INTEGER;
}

function weightedChoice(
  candidates: Problem[],
  weights: number[],
  random: () => number,
): Problem {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

export function selectAdaptiveProblem(
  problems: Problem[],
  difficulty: Difficulty,
  solvedIds: Iterable<string>,
  currentProfile?: Partial<AdaptiveProfile> | null,
  random: () => number = Math.random,
): Problem | null {
  const solved = new Set(solvedIds);
  const candidates = problems
    .filter((problem) => problem.difficulty === difficulty && !solved.has(problem.id))
    .sort((left, right) => problemOrder(left) - problemOrder(right));
  if (!candidates.length) return null;

  const profile = normalizeAdaptiveProfile(currentProfile);
  if (profile.solved < 3) {
    const onboardingPool = candidates.slice(0, Math.min(6, candidates.length));
    return onboardingPool[Math.min(onboardingPool.length - 1, Math.floor(random() * onboardingPool.length))];
  }

  const highestOrder = Math.max(...candidates.map(problemOrder).filter(Number.isFinite));
  const target = Math.min(highestOrder, Math.max(1, Math.round(profile.rating)));
  let window = candidates.filter((problem) => {
    const order = problemOrder(problem);
    return order >= target - 3 && order <= target + 6;
  });
  if (!window.length) {
    window = [...candidates]
      .sort((left, right) => Math.abs(problemOrder(left) - target) - Math.abs(problemOrder(right) - target))
      .slice(0, 10)
      .sort((left, right) => problemOrder(left) - problemOrder(right));
  }

  const weights = window.map((problem) => {
    const distance = problemOrder(problem) - target;
    let weight = 1 / (1 + Math.abs(distance));
    if (distance > 0) weight *= 1.1 + Math.min(profile.streak, 5) * 0.2;
    if (distance >= 2 && distance <= 5) weight *= 1.35;
    if (distance < -2) weight *= 0.55;
    return weight;
  });
  return weightedChoice(window, weights, random);
}
