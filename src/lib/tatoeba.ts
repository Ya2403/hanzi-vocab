import { useEffect, useState } from 'react';
// Built by scripts/build-sentences.mjs; a content-hashed file downloaded only when first needed.
import dataUrl from '../data/tatoeba-cmn.json?url';
import { cachedFetchJson, isCached, pruneCache } from './offlineCache';
import { isNew } from './srs';
import type { Word } from './types';

/** [segmented ("|"-separated words), english, tatoebaChineseId] */
type RawSentence = [string, string, number];
interface RawFile {
  s: RawSentence[];
}

export interface Sentence {
  zh: string;
  segs: string[];
  en: string;
  /** Tatoeba sentence id of the Chinese sentence (for attribution links). */
  zhId: number;
}

export interface Corpus {
  sentences: Sentence[];
  /** Word segment → indices of sentences containing it as a whole segment. */
  bySegment: Map<string, number[]>;
}

export const tatoebaUrl = (id: number) => `https://tatoeba.org/sentences/show/${id}`;

export function buildCorpus(raw: RawFile): Corpus {
  const sentences: Sentence[] = [];
  const bySegment = new Map<string, number[]>();
  raw.s.forEach(([seg, en, zhId], i) => {
    const segs = seg.split('|');
    sentences.push({ zh: segs.join(''), segs, en, zhId });
    for (const s of new Set(segs)) {
      const list = bySegment.get(s);
      if (list) list.push(i);
      else bySegment.set(s, [i]);
    }
  });
  return { sentences, bySegment };
}

// ---------- Loading ----------

const CACHE_NAME = 'tatoeba-v1';
let loaded: Corpus | null = null;
let pending: Promise<Corpus> | null = null;

export function loadCorpus(): Promise<Corpus> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= cachedFetchJson<RawFile>(dataUrl, CACHE_NAME).then(
    (raw) => {
      loaded = buildCorpus(raw);
      pruneCache(CACHE_NAME, dataUrl).catch(() => {});
      return loaded;
    },
    (e: unknown) => {
      pending = null;
      throw e;
    },
  );
  return pending;
}

export const corpusCached = () => isCached(dataUrl, CACHE_NAME);

export type CorpusStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useCorpus(enabled: boolean): { status: CorpusStatus; corpus: Corpus | null; retry(): void } {
  const [corpus, setCorpus] = useState<Corpus | null>(loaded);
  const [status, setStatus] = useState<CorpusStatus>(loaded ? 'ready' : 'idle');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || corpus) return;
    let live = true;
    setStatus('loading');
    loadCorpus().then(
      (c) => {
        if (!live) return;
        setCorpus(c);
        setStatus('ready');
      },
      () => live && setStatus('error'),
    );
    return () => {
      live = false;
    };
  }, [enabled, corpus, attempt]);
  return { status, corpus, retry: () => setAttempt((a) => a + 1) };
}

// ---------- Matching & ranking ----------

const CJK = /[㐀-鿿]/;

export interface SentenceMatch {
  sentence: Sentence;
  /** Distinct other words in the sentence that aren't in the list as learned words. */
  unknown: string[];
  /** How it matched: as a whole segmenter word, or (fallback) as a substring. */
  via: 'segment' | 'substring';
}

export const matchLabel = (m: SentenceMatch) =>
  m.unknown.length === 0 ? 'all known' : `${m.unknown.length} new word${m.unknown.length === 1 ? '' : 's'}`;

/**
 * Sentences containing `word`, best first: fewest words you haven't learned, then shortest.
 * A match must be a whole segment (学 doesn't match inside 学校); if the segmenter never
 * produces the word as one segment (图书馆 → 图书|馆), substring matches are used instead.
 */
export function findSentences(corpus: Corpus, word: Pick<Word, 'hanzi'>, myWords: Word[], limit = 10): SentenceMatch[] {
  const target = word.hanzi.trim();
  if (!target) return [];
  let via: SentenceMatch['via'] = 'segment';
  let indices = corpus.bySegment.get(target) ?? [];
  if (!indices.length) {
    via = 'substring';
    indices = [];
    corpus.sentences.forEach((s, i) => s.zh.includes(target) && indices.push(i));
  }

  const learned = new Set(myWords.filter((w) => !isNew(w)).map((w) => w.hanzi));
  const isKnown = (seg: string) => learned.has(seg) || coveredBy(seg, learned);
  const matches = indices.map((i): SentenceMatch => {
    const sentence = corpus.sentences[i];
    // Segments covered by the target (a single segment, or several for substring matches).
    const start = sentence.zh.indexOf(target);
    const end = start + target.length;
    const others = new Set<string>();
    let pos = 0;
    for (const seg of sentence.segs) {
      const segEnd = pos + seg.length;
      const overlapsTarget = pos < end && segEnd > start;
      if (!overlapsTarget && CJK.test(seg) && seg !== target) others.add(seg);
      pos = segEnd;
    }
    return { sentence, unknown: [...others].filter((s) => !isKnown(s)), via };
  });

  matches.sort(
    (a, b) =>
      a.unknown.length - b.unknown.length ||
      a.sentence.zh.length - b.sentence.zh.length ||
      a.sentence.zhId - b.sentence.zhId,
  );
  return matches.slice(0, limit);
}

/**
 * The segmenter sometimes glues words together (我去, 他在). Such a segment still counts
 * as known if it splits entirely into known words (longest match first, with backtracking).
 */
function coveredBy(seg: string, known: Set<string>): boolean {
  const chars = [...seg];
  const memo = new Map<number, boolean>();
  const from = (i: number): boolean => {
    if (i === chars.length) return true;
    if (memo.has(i)) return memo.get(i)!;
    let ok = false;
    for (let j = chars.length; j > i && !ok; j--) ok = known.has(chars.slice(i, j).join('')) && from(j);
    memo.set(i, ok);
    return ok;
  };
  return chars.length > 1 && from(0);
}

// ---------- Rotation (Sentence practice) ----------

const RECENT_KEY = 'hanzi-vocab:recentSentences';
const RECENT_PER_WORD = 3;

function readRecent(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Choose from candidates (already in preference order), skipping the ones shown most
 * recently for this word so the same sentence doesn't come up every time. Falls back to
 * the least recently shown one when every candidate was used lately.
 */
export function pickRotating<T extends { key: string }>(wordId: string, candidates: T[]): T | null {
  if (!candidates.length) return null;
  const all = readRecent();
  const recent = all[wordId] ?? [];
  const fresh = candidates.find((c) => !recent.includes(c.key));
  // `recent` is newest first, so the least recently shown candidate has the highest index.
  const choice = fresh ?? [...candidates].sort((a, b) => recent.indexOf(b.key) - recent.indexOf(a.key))[0];
  all[wordId] = [choice.key, ...recent.filter((k) => k !== choice.key)].slice(0, RECENT_PER_WORD);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(all));
  } catch {
    /* rotation is best-effort */
  }
  return choice;
}
