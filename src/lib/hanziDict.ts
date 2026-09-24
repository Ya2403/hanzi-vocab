import { useEffect, useState } from 'react';
// Vite emits this as a content-hashed file that is only downloaded when first needed.
import dictUrl from '../data/hanzi-dict.json?url';
import { cachedFetchJson, isCached, pruneCache } from './offlineCache';
import { toPinyin } from './pinyin';
import { writableChars } from './strokes';
import type { Word } from './types';

/**
 * Character data from Make Me a Hanzi (LGPL-3.0-or-later), converted by
 * scripts/build-hanzi-dict.mjs. Entry: [definition, pinyin[], decomposition (IDS), radical, etymology?]
 */
type RawEtymology = ['i' | 'p', string | null] | ['s', string | null, string | null, string | null];
type RawEntry = [string, string[], string, string, RawEtymology?];
export type HanziDict = Record<string, RawEntry>;

const CACHE_NAME = 'hanzi-dict-v1';
let loaded: HanziDict | null = null;
let pending: Promise<HanziDict> | null = null;

/** Load once per session; cache-first so it works offline after the first download. */
export function loadHanziDict(): Promise<HanziDict> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= cachedFetchJson<HanziDict>(dictUrl, CACHE_NAME).then(
    (d) => {
      loaded = d;
      pruneCache(CACHE_NAME, dictUrl).catch(() => {}); // drop previous data versions
      return d;
    },
    (e: unknown) => {
      pending = null;
      throw e;
    },
  );
  return pending;
}

export const hanziDictCached = () => isCached(dictUrl, CACHE_NAME);

export type DictStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Loads the dictionary once `enabled` becomes true. */
export function useHanziDict(enabled: boolean): { status: DictStatus; dict: HanziDict | null; retry(): void } {
  const [dict, setDict] = useState<HanziDict | null>(loaded);
  const [status, setStatus] = useState<DictStatus>(loaded ? 'ready' : 'idle');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || dict) return;
    let live = true;
    setStatus('loading');
    loadHanziDict().then(
      (d) => {
        if (!live) return;
        setDict(d);
        setStatus('ready');
      },
      () => live && setStatus('error'),
    );
    return () => {
      live = false;
    };
  }, [enabled, dict, attempt]);

  return { status, dict, retry: () => setAttempt((a) => a + 1) };
}

// ---------- Ideographic Description Sequences ----------

export type IdsNode = { kind: 'char'; char: string } | { kind: 'unknown' } | { kind: 'op'; op: string; children: IdsNode[] };

const isIdc = (c: string) => {
  const code = c.codePointAt(0)!;
  return code >= 0x2ff0 && code <= 0x2ffb;
};

/** "⿱⿱⺍冖子" → tree. "？" marks a component the dataset couldn't identify. */
export function parseIDS(ids: string): IdsNode {
  const chars = [...ids];
  let i = 0;
  const node = (): IdsNode => {
    const c = chars[i++];
    if (c === undefined || c === '？') return { kind: 'unknown' };
    if (isIdc(c)) {
      const arity = c === '⿲' || c === '⿳' ? 3 : 2;
      return { kind: 'op', op: c, children: Array.from({ length: arity }, node) };
    }
    return { kind: 'char', char: c };
  };
  return node();
}

/** Leaf components in reading order; `null` = unknown part. */
function leaves(node: IdsNode): (string | null)[] {
  if (node.kind === 'char') return [node.char];
  if (node.kind === 'unknown') return [null];
  return node.children.flatMap(leaves);
}

const STRUCTURE: Record<string, string> = {
  '⿰': 'left–right',
  '⿱': 'top–bottom',
  '⿲': 'left–middle–right',
  '⿳': 'top–middle–bottom',
  '⿴': 'enclosed',
  '⿵': 'open at the bottom',
  '⿶': 'open at the top',
  '⿷': 'open at the right',
  '⿸': 'wrapped from the upper left',
  '⿹': 'wrapped from the upper right',
  '⿺': 'wrapped from the lower left',
  '⿻': 'overlapping',
};

// ---------- Descriptions ----------

/** "good, excellent, fine; well" → "good". */
export function shortMeaning(definition: string | undefined): string | undefined {
  const first = definition?.split(/[;,]/)[0].trim();
  if (!first) return undefined;
  return first.length > 28 ? `${first.slice(0, 27)}…` : first;
}

const entryOf = (dict: HanziDict, c: string): RawEntry | undefined => (c === '_meta' ? undefined : dict[c]);

export interface Gloss {
  char: string;
  pinyin?: string;
  meaning?: string;
}

const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

/**
 * Readings with a toned one first. The data sometimes only lists the neutral-tone
 * reading (子: "zi"); pinyin-pro then supplies the standalone one (zǐ).
 */
function readings(char: string, listed: string[]): string[] {
  const toned = listed.filter((p) => TONE_MARK.test(p));
  if (toned.length) return [...toned, ...listed.filter((p) => !toned.includes(p))];
  const fallback = toPinyin(char);
  return TONE_MARK.test(fallback) && !listed.includes(fallback) ? [fallback, ...listed] : listed;
}

export function gloss(dict: HanziDict, char: string): Gloss {
  const e = entryOf(dict, char);
  return { char, pinyin: e ? readings(char, e[1])[0] : undefined, meaning: shortMeaning(e?.[0]) };
}

export interface ComponentInfo extends Partial<Gloss> {
  /** Missing for parts the dataset marks as unknown ("？"). */
  char?: string;
  role?: 'meaning' | 'sound';
}

export interface Etymology {
  type: 'ideographic' | 'pictographic' | 'pictophonetic';
  hint?: string;
  semantic?: Gloss;
  phonetic?: Gloss;
}

export interface CharInfo {
  char: string;
  pinyin: string[];
  definition?: string;
  radical?: Gloss;
  structure?: string;
  components: ComponentInfo[];
  /** Not built from smaller parts (the whole decomposition is unknown). */
  basic: boolean;
  etymology?: Etymology;
}

/** Everything the Breakdown view shows for one character, or null if it isn't in the dataset. */
export function describe(dict: HanziDict, char: string): CharInfo | null {
  const e = entryOf(dict, char);
  if (!e) return null;
  const [definition, pinyin, ids, radical, rawEty] = e;

  let etymology: Etymology | undefined;
  if (rawEty) {
    const [t, hint] = rawEty;
    etymology = { type: t === 'i' ? 'ideographic' : t === 'p' ? 'pictographic' : 'pictophonetic', hint: hint ?? undefined };
    if (rawEty[0] === 's') {
      if (rawEty[2]) etymology.semantic = gloss(dict, rawEty[2]);
      if (rawEty[3]) etymology.phonetic = gloss(dict, rawEty[3]);
    }
  }

  const tree = parseIDS(ids);
  const seen = new Set<string>();
  const components: ComponentInfo[] = [];
  for (const leaf of leaves(tree)) {
    if (leaf === null) {
      components.push({});
      continue;
    }
    if (leaf === char || seen.has(leaf)) continue;
    seen.add(leaf);
    const role = leaf === etymology?.semantic?.char ? 'meaning' : leaf === etymology?.phonetic?.char ? 'sound' : undefined;
    components.push({ ...gloss(dict, leaf), role });
  }

  // Nothing identifiable inside (女 = "？", 氵 = "⿱？？"): treat as a basic building block.
  const basic = components.every((c) => !c.char);
  return {
    char,
    pinyin: readings(char, pinyin),
    definition: definition || undefined,
    radical: radical && radical !== char ? gloss(dict, radical) : undefined,
    structure: tree.kind === 'op' && !basic ? STRUCTURE[tree.op] : undefined,
    components: basic ? [] : components,
    basic,
    etymology,
  };
}

// ---------- Component search ----------

const deepCache = new Map<string, Set<string>>();

/** Every component of `char` at every level (好 → 女, 子; 谢 → 讠, 射, 身, 寸, …). */
export function deepComponents(dict: HanziDict, char: string, depth = 0, visiting = new Set<string>()): Set<string> {
  const cached = deepCache.get(char);
  if (cached) return cached;
  const out = new Set<string>();
  const e = entryOf(dict, char);
  if (!e || depth > 6 || visiting.has(char)) return out;
  visiting.add(char);
  const parts = leaves(parseIDS(e[2])).filter((c): c is string => c !== null && c !== char);
  const ety = e[4];
  if (ety?.[0] === 's') for (const c of [ety[2], ety[3]]) if (c && c !== char) parts.push(c);
  for (const p of parts) {
    out.add(p);
    for (const sub of deepComponents(dict, p, depth + 1, visiting)) out.add(sub);
  }
  visiting.delete(char);
  if (depth === 0) deepCache.set(char, out);
  return out;
}

/** Words (other than `excludeId`) with a character that is, or contains, `component`. */
export function wordsContaining(dict: HanziDict, component: string, words: Word[], excludeId?: string): Word[] {
  return words.filter(
    (w) => w.id !== excludeId && writableChars(w.hanzi).some((c) => c === component || deepComponents(dict, c).has(component)),
  );
}
