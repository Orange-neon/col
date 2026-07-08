export const SOLO_DURATION_SECONDS = 5 * 60;
export const SOLO_DURATION_MS = SOLO_DURATION_SECONDS * 1000;

export function createSoloDeadline(now = Date.now()): number {
  return now + SOLO_DURATION_MS;
}

export function getSoloSecondsRemaining(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
