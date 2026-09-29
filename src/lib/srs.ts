import { addDays, today } from './date';
import { isRadicalOnly } from './learn';
import { getSettings } from './settings';
import { writableChars } from './strokes';
import type { CardDirection, Skill, SkillState, Skills, SrsState, Word } from './types';

/** Quality grades (SM-2 uses 0–5; anything below 3 counts as a failure). */
export const Grade = { Again: 1, Hard: 3, Good: 4, Easy: 5 } as const;

export function newSrs(on: string = today()): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: on };
}

/** Apply one SM-2 review with quality `q` (0–5) on date `on`. */
export function applyReview(s: SrsState, q: number, on: string = today()): SrsState {
  let { interval, reps, lapses } = s;
  if (q < 3) {
    // A lapse: forgetting a skill that had graduated to day-long intervals.
    if (s.interval >= 1) lapses += 1;
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.max(interval + 1, Math.round(interval * s.ease));
  }
  const ease = Math.max(1.3, s.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return {
    ...s, // keeps leech flags and statistics
    ease: Math.round(ease * 100) / 100,
    interval,
    reps,
    lapses,
    due: addDays(on, interval),
    lastReviewed: on,
  };
}

export function formatInterval(days: number): string {
  if (days < 1) return 'now';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// ---------- Skills ----------

export const SKILL_LABEL: Record<Skill, string> = {
  meaning: 'Meaning',
  pinyin: 'Pinyin',
  recall: 'Recall',
  writing: 'Writing',
};

/** Which skill a card direction tests. */
export const DIR_SKILL: Record<CardDirection, Skill> = { 'zh-en': 'meaning', 'zh-py': 'pinyin', 'en-zh': 'recall' };
/** The card direction that tests a skill (writing cards show the meaning, like recall). */
export const SKILL_DIR: Record<Skill, CardDirection> = { meaning: 'zh-en', pinyin: 'zh-py', recall: 'en-zh', writing: 'en-zh' };

/** A word's writing skill starts once its recall interval reaches this (with "Writing practice" on). */
export const WRITING_START_INTERVAL = 6;

const writingOn = () => getSettings().writingPractice;

/** New = not learned in Learn yet (no skills). */
export const isNew = (w: Word): boolean => !w.skills.meaning;
/** Finished Learn: has review schedules. The opposite of isNew. */
export const isLearned = (w: Word): boolean => !isNew(w);

/** Skills a word is reviewed on. Radical-only entries (氵…) have no reading: meaning and recall only. */
export function activeSkills(w: Word, writing: boolean = writingOn()): Skill[] {
  if (isNew(w)) return [];
  if (isRadicalOnly(w)) return ['meaning', 'recall'];
  const list: Skill[] = ['meaning', 'pinyin', 'recall'];
  const canWrite = writableChars(w.hanzi).length > 0;
  if (writing && canWrite && (w.skills.writing || (w.skills.recall?.interval ?? 0) >= WRITING_START_INTERVAL)) list.push('writing');
  return list;
}

/** A skill's state; one that hasn't started yet (e.g. writing) is fresh and due today. */
export const skillState = (w: Word, k: Skill, on: string = today()): SkillState => w.skills[k] ?? newSrs(on);

/** The word with one skill replaced. */
export const withSkill = (w: Word, k: Skill, s: SkillState): Word => ({ ...w, skills: { ...w.skills, [k]: s } });

/** Active skills whose review date has arrived. */
export const dueSkills = (w: Word, on: string = today(), writing: boolean = writingOn()): Skill[] =>
  activeSkills(w, writing).filter((k) => skillState(w, k, on).due <= on);

/** Learned and at least one skill is due. New words are never "due": they belong to Learn. */
export const isDueLearned = (w: Word, on: string = today(), writing: boolean = writingOn()): boolean => dueSkills(w, on, writing).length > 0;

/** The earliest review date over the word's active skills (null for new words). */
export function nextDue(w: Word, on: string = today(), writing: boolean = writingOn()): string | null {
  const dues = activeSkills(w, writing).map((k) => skillState(w, k, on).due);
  return dues.length ? dues.sort()[0] : null;
}

// ---------- Leeches ----------

/** Pseudo-tag used by the word list filter and the Practice source picker (e.g. #practice?tag=…). */
export const LEECH_FILTER = '__leeches__';

/** Lapses that count toward the leech threshold (only those since the last "Unmark leech"). */
export const leechLapses = (s: SrsState): number => s.lapses - (s.lapsesAtUnmark ?? 0);

/** Skills flagged as leeches. */
export const leechSkills = (w: Word): Skill[] => (Object.keys(w.skills) as Skill[]).filter((k) => w.skills[k]?.leech);
export const isLeech = (w: Word): boolean => leechSkills(w).length > 0;

/** Apply a review and flag the skill as a leech the moment a lapse brings it to `threshold`. */
export function reviewWithLeech(s: SrsState, q: number, threshold: number, on: string = today()) {
  const next = applyReview(s, q, on);
  const becameLeech = !s.leech && next.lapses > s.lapses && leechLapses(next) >= threshold;
  return { srs: becameLeech ? { ...next, leech: true } : next, becameLeech };
}

export const unmarkLeechSkill = (s: SrsState): SrsState => ({ ...s, leech: false, lapsesAtUnmark: s.lapses });

/** Unmark every leech skill of a word. */
export function unmarkLeech(w: Word): Word {
  const skills: Skills = { ...w.skills };
  for (const k of leechSkills(w)) skills[k] = unmarkLeechSkill(skills[k]!);
  return { ...w, skills };
}

// ---------- Answer statistics ----------

/** Record one answer (any mode) in a skill's accuracy statistics. */
export function recordAnswer(s: SrsState, correct: boolean, now: number = Date.now()): SrsState {
  return {
    ...s,
    answered: (s.answered ?? 0) + 1,
    correct: (s.correct ?? 0) + (correct ? 1 : 0),
    recent: ((s.recent ?? '') + (correct ? '1' : '0')).slice(-5),
    lastSeen: now,
  };
}

export const accuracy = (s: SrsState): number | null => (s.answered ? (s.correct ?? 0) / s.answered : null);

/** A skill counts as "well known" once its interval reached a week. */
export const WELL_KNOWN_INTERVAL = 7;

/**
 * A miss in free Practice: the skill comes back in Review tomorrow at the latest, with its
 * interval halved so it has to earn long gaps again. For a well-known skill it also counts as a
 * lapse (and can make it a leech). Correct answers in Practice never change the schedule.
 */
export function practiceMiss(s: SrsState, leechThreshold: number, on: string = today()) {
  const tomorrow = addDays(on, 1);
  const wellKnown = s.interval >= WELL_KNOWN_INTERVAL;
  const next: SrsState = {
    ...s,
    due: s.due > tomorrow ? tomorrow : s.due,
    interval: Math.max(1, Math.round(s.interval / 2)),
    lapses: s.lapses + (wellKnown ? 1 : 0),
  };
  const becameLeech = wellKnown && !s.leech && leechLapses(next) >= leechThreshold;
  return { srs: becameLeech ? { ...next, leech: true } : next, becameLeech };
}

// ---------- Learning & migration ----------

export type SkillStats = Pick<SkillState, 'answered' | 'correct' | 'recent' | 'lastSeen'>;

/** Skills of a word just learned in Learn mode: first reviews tomorrow, keeping the answers given while learning. */
export function learnedSkills(w: Pick<Word, 'hanzi'>, stats: Partial<Record<Skill, SkillStats>> = {}, on: string = today()): Skills {
  const list: Skill[] = isRadicalOnly(w) ? ['meaning', 'recall'] : ['meaning', 'pinyin', 'recall'];
  const skills: Skills = {};
  for (const k of list) skills[k] = { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: addDays(on, 1), lastReviewed: on, ...stats[k] };
  return skills;
}

/** Small stable hash, so a migrated word lands on the same day on every device. */
function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h;
}

/** Overdue seeded skills are spread over at most this many days. */
const SEED_SPREAD = 10;

/**
 * A pinyin/recall skill seeded from an old single schedule: half the interval (≥ 1 day), due
 * from tomorrow at the earliest. Ones that would be overdue are spread over the next days.
 */
export function seedSkill(m: SkillState, id: string, on: string = today()): SkillState {
  const half = Math.max(1, Math.round(m.interval / 2));
  const tomorrow = addDays(on, 1);
  let due = addDays(m.lastReviewed ?? on, half);
  if (due < tomorrow) due = addDays(tomorrow, hash(id) % Math.min(half, SEED_SPREAD));
  return { ease: m.ease, interval: half, reps: m.reps, lapses: 0, due, lastReviewed: m.lastReviewed };
}

/**
 * Words from before skills (one SM-2 schedule in `srs`): the schedule becomes `meaning`, and
 * pinyin/recall are seeded from it. Words that had review history count as learned.
 */
export function migrateLegacySrs(id: string, hanzi: string, srs: SkillState & { learnedOn?: string }, on: string = today()): { skills: Skills; learnedOn?: string } {
  const learned = srs.reps > 0 || !!srs.lastReviewed;
  if (!learned) return { skills: {} };
  const { learnedOn, ...meaning } = srs as SkillState & { learnedOn?: string; successes?: number };
  delete (meaning as { successes?: number }).successes;
  const skills: Skills = { meaning };
  if (!isRadicalOnly({ hanzi })) skills.pinyin = seedSkill(meaning, id, on);
  skills.recall = seedSkill(meaning, id, on);
  return { skills, learnedOn };
}
