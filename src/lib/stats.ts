import { activeSkills, isLearned, skillState, WELL_KNOWN_INTERVAL } from './srs';
import type { Skill, Word } from './types';

/** A skill counts as known once its interval reached a week. */
export const isKnown = (w: Word, k: Skill): boolean => activeSkills(w).includes(k) && skillState(w, k).interval >= WELL_KNOWN_INTERVAL;

export interface SkillCounts {
  /** Learned words that have this skill. */
  active: number;
  known: number;
}

export type SkillTotals = Record<Skill, SkillCounts>;

export function skillTotals(words: Word[]): SkillTotals {
  const totals: SkillTotals = {
    meaning: { active: 0, known: 0 },
    pinyin: { active: 0, known: 0 },
    recall: { active: 0, known: 0 },
    writing: { active: 0, known: 0 },
  };
  for (const w of words) {
    for (const k of activeSkills(w)) {
      totals[k].active++;
      if (isKnown(w, k)) totals[k].known++;
    }
  }
  return totals;
}

export interface TagProgress {
  tag: string;
  total: number;
  learned: number;
  known: Record<Skill, number>;
}

/** Per tag: new vs learned words and how many know each skill. */
export function tagProgress(words: Word[]): TagProgress[] {
  const tags = [...new Set(words.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return tags.map((tag) => {
    const inTag = words.filter((w) => w.tags.includes(tag));
    const known = { meaning: 0, pinyin: 0, recall: 0, writing: 0 };
    for (const w of inTag) for (const k of activeSkills(w)) if (isKnown(w, k)) known[k]++;
    return { tag, total: inTag.length, learned: inTag.filter(isLearned).length, known };
  });
}

/** Learned words with tone errors, most first. */
export const toneTrouble = (words: Word[]): Word[] =>
  words.filter((w) => isLearned(w) && (w.toneErrors ?? 0) > 0).sort((a, b) => (b.toneErrors ?? 0) - (a.toneErrors ?? 0));
