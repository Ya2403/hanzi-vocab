/**
 * Words in Practice: a session still picks character skills by priority, but an exercise can be
 * done through one of the character's unlocked words, and words that need work come up on their
 * own. Pure functions (randomness and time passed in), unit-tested.
 */
import { entryKind, isWordEntry, needsWork, type CharLinks } from './entries';
import { pickSession, wordPriority } from './planner';
import { activeSkills, isLearned } from './srs';
import type { Skill, Word } from './types';

/** "Words in practice": off / some (default) / a lot. */
export type WordsInPractice = 'off' | 'some' | 'lot';
/** Share of character picks done through a word, when the character has an unlocked word. */
export const WORD_SHARE: Record<WordsInPractice, number> = { off: 0, some: 0.4, lot: 0.75 };
/** Words that need work are added on their own, up to this share of a session. */
export const NEEDS_WORK_SHARE = 0.15;

export interface SessionPick {
  /** The character, or the word that stands in for it. */
  entry: Word;
  /** The character skill being practised. */
  skill: Skill;
  /** For a word: the character whose skill it reviews. */
  target?: Word;
}

/**
 * Unlocked words that can review `char`'s `skill`: names only for meaning. Words that need work
 * first, then the least recently seen (never seen first).
 */
export function wordCandidates(char: Word, skill: Skill, links: CharLinks): Word[] {
  return (links.usedIn.get(char.id) ?? [])
    .filter((w) => isLearned(w) && (skill === 'meaning' || entryKind(w) !== 'name'))
    .sort((a, b) => Number(needsWork(b)) - Number(needsWork(a)) || (a.stats?.lastSeen ?? 0) - (b.stats?.lastSeen ?? 0));
}

/** The character a word reviews when it comes up on its own: its learned character that needs it most. */
export function targetChar(word: Word, links: CharLinks, now: number = Date.now()): Word | undefined {
  let best: { w: Word; p: number } | undefined;
  for (const slot of links.charsOf.get(word.id) ?? []) {
    const c = slot.entry;
    if (!c || !activeSkills(c).length) continue;
    const p = wordPriority(c, now)?.priority ?? 0;
    if (!best || p > best.p) best = { w: c, p };
  }
  return best?.w;
}

/**
 * A session of `size` exercises:
 * - words that need work (unlocked, in `words`), up to 15% of the session, least recently seen
 *   first, each reviewing its weakest character (names: meaning);
 * - the rest picked from `chars` by priority (pickSession); about \`WORD_SHARE[use]\` of those are
 *   done through one of the character's unlocked words instead (each word once per session).
 */
export function planSession(
  chars: Word[],
  words: Word[],
  size: number,
  links: CharLinks,
  opts: { use: WordsInPractice; now?: number; rnd?: () => number },
): SessionPick[] {
  const rnd = opts.rnd ?? Math.random;
  const now = opts.now ?? Date.now();
  const used = new Set<string>();
  const direct: SessionPick[] = [];
  if (opts.use !== 'off') {
    const flagged = words
      .filter((w) => isWordEntry(w) && isLearned(w) && needsWork(w))
      .sort((a, b) => (a.stats?.lastSeen ?? 0) - (b.stats?.lastSeen ?? 0));
    for (const w of flagged.slice(0, Math.round(size * NEEDS_WORK_SHARE))) {
      const target = targetChar(w, links, now);
      if (!target) continue;
      const skill = entryKind(w) === 'name' ? 'meaning' : (wordPriority(target, now)?.skill ?? 'meaning');
      direct.push({ entry: w, skill, target });
      used.add(w.id);
    }
  }
  const picks: SessionPick[] = pickSession(chars, size - direct.length, { now, rnd }).map((p) => {
    if (rnd() >= WORD_SHARE[opts.use]) return { entry: p.word, skill: p.skill };
    const word = wordCandidates(p.word, p.skill, links).find((w) => !used.has(w.id));
    if (!word) return { entry: p.word, skill: p.skill };
    used.add(word.id);
    return { entry: word, skill: p.skill, target: p.word };
  });
  // Mix the words that need work in at random places.
  for (const d of direct) picks.splice(Math.floor(rnd() * (picks.length + 1)), 0, d);
  return picks;
}
