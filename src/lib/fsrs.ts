/**
 * FSRS scheduling for word skills (via ts-fsrs). Each skill keeps its FSRS card in
 * `SkillState.fsrs`; skills that only have the older SM-2 data are converted on the fly
 * (interval → stability, ease → difficulty), so nothing has to be migrated in storage.
 * Reviews always use the real time since the last review, so late reviews are handled right.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs';
import { toDateStr } from './date';
import type { FsrsData, SkillState } from './types';

/** Day-based scheduling (no same-day learning steps), no random fuzz. */
const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false }));

const DAY = 86_400_000;

/** Local date string (YYYY-MM-DD) → that day at noon, as a timestamp. */
const dayToTime = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

/** SM-2 ease (1.3 … 2.5+) → FSRS difficulty (1 … 10): ease 2.5 ≈ 5, ease 1.3 ≈ 9. */
const easeToDifficulty = (ease: number) => Math.min(10, Math.max(1, 5 + (2.5 - ease) * 3.5));

/** The skill's FSRS card: stored, or estimated from its SM-2 data. */
export function toCard(st: SkillState): Card {
  const f = st.fsrs;
  if (f) {
    return {
      due: new Date(f.due),
      stability: f.s,
      difficulty: f.d,
      elapsed_days: 0,
      scheduled_days: Math.max(0, Math.round((f.due - f.last) / DAY)),
      learning_steps: 0,
      // The skill's own counts are the source of truth (they match the card after every review).
      reps: st.reps,
      lapses: st.lapses,
      state: f.state as State,
      last_review: new Date(f.last),
    };
  }
  if (!st.lastReviewed && st.reps === 0) return createEmptyCard(new Date(dayToTime(st.due)));
  const last = st.lastReviewed ? dayToTime(st.lastReviewed) : dayToTime(st.due) - st.interval * DAY;
  return {
    due: new Date(dayToTime(st.due)),
    // The SM-2 interval is the best estimate of how long the memory lasts.
    stability: Math.max(0.5, st.interval),
    difficulty: easeToDifficulty(st.ease),
    elapsed_days: 0,
    scheduled_days: st.interval,
    learning_steps: 0,
    reps: st.reps,
    lapses: st.lapses,
    state: st.reps === 0 && st.lapses > 0 ? State.Relearning : State.Review,
    last_review: new Date(last),
  };
}

const fromCard = (c: Card, now: number): FsrsData => ({
  s: c.stability,
  d: c.difficulty,
  state: c.state,
  last: c.last_review ? c.last_review.getTime() : now,
  due: c.due.getTime(),
  reps: c.reps,
  lapses: c.lapses,
});

/** App grades (Again 1, Hard 3, Good 4, Easy 5) → FSRS ratings. */
const RATING: Record<number, FsrsGrade> = { 1: Rating.Again, 2: Rating.Again, 3: Rating.Hard, 4: Rating.Good, 5: Rating.Easy };
export const toRating = (q: number): FsrsGrade => RATING[Math.round(q)] ?? (q < 3 ? Rating.Again : Rating.Good);

/**
 * Review a skill with grade `q` at `now`. Updates the FSRS card and, for the rest of the app,
 * the interval (days until the next review), due date, repetitions and lapses.
 */
export function fsrsReview(st: SkillState, q: number, now: number = Date.now()): SkillState {
  const { card } = scheduler.next(toCard(st), new Date(now), toRating(q));
  return {
    ...st,
    fsrs: fromCard(card, now),
    interval: card.scheduled_days,
    due: toDateStr(card.due),
    reps: card.reps,
    lapses: card.lapses,
    lastReviewed: toDateStr(new Date(now)),
  };
}

/** A skill just learned in Learn mode: a first FSRS review graded Good. */
export function learnedState(now: number = Date.now()): SkillState {
  const empty: SkillState = { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: toDateStr(new Date(now)) };
  return fsrsReview({ ...empty, fsrs: fromCard(createEmptyCard(new Date(now)), now) }, 4, now);
}

/** Probability (0–1) of remembering the skill right now. A skill never reviewed: 0. */
export function retrievability(st: SkillState, now: number = Date.now()): number {
  const card = toCard(st);
  if (card.state === State.New) return 0;
  return scheduler.get_retrievability(card, new Date(now), false);
}

/** How long (days) the memory lasts: the time for retrievability to drop to 90%. */
export const stability = (st: SkillState): number => toCard(st).stability;
