/**
 * Sentences as reading and review material for words: which sentences are readable (all
 * their words learned), groups (dialogues, and loose sentences per tag), and the material
 * for sentence exercises (translation options, word tiles, dialogue replies, blanks).
 * Sentences themselves are not scheduled. Pure functions (randomness passed in), unit-tested.
 */
import { isLearned } from './srs';
import { segment, type Links } from './sentences';
import type { Dialogue, Sentence, Word } from './types';

/** Readable: it links to at least one of your words, and all of them are learned. */
export function isReadable(s: Sentence, links: Links): boolean {
  const words = links.bySentence.get(s.id) ?? [];
  return words.length > 0 && words.every(isLearned);
}

// ---------- Readiness ----------

export interface Readiness {
  /** Linked words, and how many are learned. */
  total: number;
  learned: number;
  /** Linked words still to learn (unique). */
  missing: Word[];
  ready: boolean;
}

/** A group of sentences is ready once `percent`% of the words they contain are learned (no words = ready). */
export function readiness(sentences: Sentence[], links: Links, percent: number): Readiness {
  const seen = new Map<string, Word>();
  for (const s of sentences) for (const w of links.bySentence.get(s.id) ?? []) seen.set(w.id, w);
  const all = [...seen.values()];
  const missing = all.filter((w) => !isLearned(w));
  const learned = all.length - missing.length;
  return { total: all.length, learned, missing, ready: !all.length || (learned / all.length) * 100 >= percent };
}

// ---------- Learn groups ----------

export interface LearnGroup {
  key: string;
  title: string;
  dialogue?: Dialogue;
  /** In order (dialogue line order, or oldest first). */
  sentences: Sentence[];
  /** Speakers per sentence id (dialogues). */
  speakers: Map<string, string | undefined>;
}

/** Dialogues, then loose sentences grouped by their first tag ("Other" without one). */
export function learnGroups(sentences: Sentence[], dialogues: Dialogue[]): LearnGroup[] {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const groups: LearnGroup[] = [];
  const inDialogue = new Set<string>();
  for (const d of [...dialogues].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))) {
    const lines = d.lines.map((l) => ({ s: byId.get(l.sentenceId), speaker: l.speaker })).filter((l): l is { s: Sentence; speaker: string | undefined } => !!l.s);
    lines.forEach((l) => inDialogue.add(l.s.id));
    if (lines.length) groups.push({ key: `d:${d.id}`, title: d.title, dialogue: d, sentences: lines.map((l) => l.s), speakers: new Map(lines.map((l) => [l.s.id, l.speaker])) });
  }
  const loose = new Map<string, Sentence[]>();
  for (const s of [...sentences].sort((a, b) => a.createdAt - b.createdAt)) {
    if (inDialogue.has(s.id) || s.dialogueId) continue;
    const tag = s.tags[0] ?? '';
    loose.set(tag, [...(loose.get(tag) ?? []), s]);
  }
  for (const [tag, list] of [...loose].sort((a, b) => (a[0] || '￿').localeCompare(b[0] || '￿', undefined, { numeric: true }))) {
    groups.push({ key: `t:${tag}`, title: tag || 'Other sentences', sentences: list, speakers: new Map() });
  }
  return groups;
}

// ---------- Exercise material ----------

const pickN = <T,>(items: T[], n: number, rnd: () => number): T[] => {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Translation options for `s`: its own plus `n - 1` translations of other sentences, preferring
 * `near` (same dialogue / tag), then `pool`. Shuffled; never two that read the same.
 */
export function translationOptions(s: Sentence, near: Sentence[], pool: Sentence[], n: number, rnd: () => number = Math.random): string[] {
  const out = [s.translation];
  const seen = new Set([norm(s.translation)]);
  for (const list of [pickN(near, near.length, rnd), pickN(pool, pool.length, rnd)]) {
    for (const o of list) {
      if (out.length >= n) break;
      const key = norm(o.translation);
      if (!o.translation.trim() || o.id === s.id || seen.has(key)) continue;
      seen.add(key);
      out.push(o.translation);
    }
  }
  return pickN(out, out.length, rnd);
}

const PUNCT = /^[\p{P}\p{S}\s]+$/u;

/**
 * Split a segment around the words of `known` it contains (longest first), leaving other
 * characters single: 他是 → 他 + 是 when 是 is known. Null when it contains none of them.
 */
export function splitKnown(seg: string, known: Set<string>): string[] | null {
  const chars = [...seg];
  const out: string[] = [];
  let hits = 0;
  for (let i = 0; i < chars.length; ) {
    let n = Math.min(4, chars.length - i);
    while (n > 0 && !known.has(chars.slice(i, i + n).join(''))) n--;
    if (n) hits++;
    out.push(chars.slice(i, i + Math.max(1, n)).join(''));
    i += Math.max(1, n);
  }
  return hits ? out : null;
}

/**
 * The word tiles of a sentence, in order (punctuation dropped). A segment that isn't one of
 * `known` (your words) but is made of them is split (我是 → 我 + 是). Falls back to characters.
 */
export function sentenceTiles(zh: string, known: Set<string> = new Set()): string[] {
  const segs = segment(zh);
  const raw = segs ? segs.map((x) => x.text) : [...zh];
  return raw
    .filter((t) => !PUNCT.test(t))
    .flatMap((t) => ([...t].length > 1 && !known.has(t) ? (splitKnown(t, known) ?? [t]) : [t]));
}

/** Shuffled tiles for "build the sentence": the sentence's own plus 1–2 from other sentences it doesn't contain. */
export function buildTiles(s: Sentence, others: Sentence[], rnd: () => number = Math.random, known: Set<string> = new Set()): { answer: string[]; tiles: string[] } {
  const answer = sentenceTiles(s.zh, known);
  const own = new Set(answer);
  const candidates = [...new Set(others.filter((o) => o.id !== s.id).flatMap((o) => sentenceTiles(o.zh, known)))].filter((t) => !own.has(t) && !s.zh.includes(t));
  const extra = pickN(candidates, answer.length > 1 ? 1 + Math.floor(rnd() * 2) : 1, rnd);
  let tiles = pickN([...answer, ...extra], answer.length + extra.length, rnd);
  // Don't hand out the tiles already in the right order.
  if (tiles.slice(0, answer.length).join('') === answer.join('') && tiles.length > 1) tiles = [...tiles.slice(1), tiles[0]];
  return { answer, tiles };
}

/** Built tiles are right when they spell the sentence (any tile order that gives the same text). */
export const tilesCorrect = (placed: string[], answer: string[]) => placed.join('') === answer.join('');

/**
 * Dialogue response: after line `i - 1`, which line comes next? The right reply (line i) plus
 * `n - 1` other lines of the dialogue (never the prompt itself).
 */
export function responseOptions(lines: Sentence[], i: number, n: number, rnd: () => number = Math.random): Sentence[] {
  const right = lines[i];
  const others = lines.filter((l, k) => k !== i && k !== i - 1 && l.zh !== right.zh);
  return pickN([right, ...pickN(others, n - 1, rnd)], Math.min(n, others.length + 1), rnd);
}

// ---------- Fill the blank ----------

/** Learned words of the sentence that appear in it as written (candidates for the blank). */
export const clozeCandidates = (s: Sentence, linked: Word[]): Word[] => linked.filter((w) => isLearned(w) && w.hanzi.trim() && s.zh.includes(w.hanzi.trim()));

/** The word to blank: preferably a longer one (more to recall), with some variety. */
export function clozeTarget(s: Sentence, linked: Word[], rnd: () => number = Math.random): Word | null {
  const list = clozeCandidates(s, linked);
  if (!list.length) return null;
  const scored = list.map((w) => ({ w, score: [...w.hanzi].length + rnd() * 1.5 })).sort((a, b) => b.score - a.score);
  return scored[0].w;
}

/** Four options: the blanked word plus learned words of similar length that don't appear in the sentence. */
export function clozeOptions(target: Word, s: Sentence, pool: Word[], n = 4, rnd: () => number = Math.random): Word[] {
  const len = [...target.hanzi].length;
  const others = pool
    .filter((w) => w.id !== target.id && isLearned(w) && w.hanzi !== target.hanzi && !s.zh.includes(w.hanzi))
    .map((w) => ({ w, score: Math.abs([...w.hanzi].length - len) + rnd() * 1.2 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n - 1)
    .map((x) => x.w);
  const all = [target, ...others];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}
