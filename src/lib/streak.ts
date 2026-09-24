import { diffDays } from './date';
import type { StreakState } from './types';

export const emptyStreak: StreakState = { current: 0, longest: 0, lastDate: null };

/** Register activity on date `on`, extending or restarting the streak. */
export function bumpStreak(s: StreakState, on: string): StreakState {
  if (s.lastDate === on) return s;
  const continues = s.lastDate !== null && diffDays(s.lastDate, on) === 1;
  const current = continues ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDate: on };
}

/** The streak as it stands on `on`: still alive if the last activity was today or yesterday. */
export function liveStreak(s: StreakState, on: string): number {
  if (!s.lastDate) return 0;
  return diffDays(s.lastDate, on) <= 1 ? s.current : 0;
}
