/**
 * Sentence and dialogue items: creation, automatic word links, migration of the old one-example-
 * per-word field, and the bulk-add / translation formats. Pure functions (unit-tested).
 */
import { convert } from 'pinyin-pro';
import { toPinyin } from './pinyin';
import { newId, normalizeTags, parseTagText } from './words';
import type { Dialogue, Sentence, SentenceInput, Word } from './types';

const CJK = /[㐀-鿿豈-﫿]/;

export function cleanSentenceInput(input: SentenceInput): SentenceInput {
  const zh = input.zh.trim();
  const notes = input.notes?.trim();
  return {
    zh,
    pinyin: input.pinyin.trim().replace(/\s+/g, ' ') || toPinyin(zh),
    translation: input.translation.trim(),
    tags: normalizeTags(input.tags),
    notes: notes || undefined,
    wordIds: input.wordIds?.length ? [...new Set(input.wordIds)] : undefined,
    tatoebaId: input.tatoebaId,
  };
}

export function createSentence(input: SentenceInput, createdAt: number = Date.now(), id: string = newId()): Sentence {
  return { id, ...cleanSentenceInput(input), createdAt, updatedAt: createdAt };
}

export function createDialogue(title: string, tags: string[], createdAt: number = Date.now()): Dialogue {
  return { id: newId(), title: title.trim(), tags: normalizeTags(tags), lines: [], createdAt, updatedAt: createdAt };
}

export const needsTranslation = (s: Sentence): boolean => !s.translation.trim();

// ---------- Linked words ----------

let segmenter: Intl.Segmenter | null | undefined;
/** Word segments of a Chinese text, with their positions (null when Intl.Segmenter is missing). */
export function segment(text: string): { text: string; index: number }[] | null {
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    } catch {
      segmenter = null;
    }
  }
  if (!segmenter) return null;
  return [...segmenter.segment(text)].filter((s) => s.isWordLike !== false && CJK.test(s.segment)).map((s) => ({ text: s.segment, index: s.index }));
}

/**
 * The words of `words` that a sentence contains, in order of appearance:
 * 1. whole words: a segment, or several consecutive segments (图书 + 馆 = 图书馆), equal to a word;
 * 2. single characters not covered by a whole word, if that character is a word in the list;
 * plus any words linked by hand. Without Intl.Segmenter, multi-character words match as substrings.
 */
export function linkedWordIds(s: Pick<Sentence, 'zh' | 'wordIds'>, byHanzi: Map<string, Word>): string[] {
  const text = s.zh;
  const found = new Map<string, number>(); // word id → first position
  const covered = new Array<boolean>(text.length).fill(false);
  const take = (w: Word, at: number) => {
    found.set(w.id, Math.min(found.get(w.id) ?? Infinity, at));
    for (let i = at; i < at + w.hanzi.length; i++) covered[i] = true;
  };

  const segs = segment(text);
  if (segs) {
    // Runs of 1–4 consecutive segments, longest first, so 图书馆 beats 图书.
    for (let i = 0; i < segs.length; i++) {
      for (let n = Math.min(4, segs.length - i); n >= 1; n--) {
        const run = segs.slice(i, i + n);
        // Only consecutive segments (nothing like punctuation in between).
        const start = run[0].index;
        const joined = run.map((r) => r.text).join('');
        if (text.slice(start, start + joined.length) !== joined) continue;
        const w = byHanzi.get(joined);
        if (w && (n > 1 || !covered[start])) {
          take(w, start);
          break;
        }
      }
    }
  } else {
    for (const w of byHanzi.values()) {
      if ([...w.hanzi].length < 2) continue;
      const at = text.indexOf(w.hanzi);
      if (at >= 0) take(w, at);
    }
  }
  // What's left (e.g. 中国 inside the segment 中国人): longest words first, then single characters.
  for (let i = 0; i < text.length; ) {
    if (covered[i] || !CJK.test(text[i])) {
      i++;
      continue;
    }
    let hit: Word | undefined;
    for (let n = Math.min(4, text.length - i); n >= 1 && !hit; n--) {
      if (covered.slice(i, i + n).some(Boolean)) continue;
      hit = byHanzi.get(text.slice(i, i + n));
    }
    if (hit) {
      take(hit, i);
      i += hit.hanzi.length;
    } else i++;
  }
  const auto = [...found].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  return [...new Set([...auto, ...(s.wordIds ?? [])])];
}

export interface Links {
  /** Sentence id → linked words (in sentence order). */
  bySentence: Map<string, Word[]>;
  /** Word id → sentences that contain it. */
  byWord: Map<string, Sentence[]>;
}

export function computeLinks(sentences: Sentence[], words: Word[]): Links {
  const byHanzi = new Map<string, Word>();
  for (const w of words) if (!byHanzi.has(w.hanzi.trim())) byHanzi.set(w.hanzi.trim(), w);
  const byId = new Map(words.map((w) => [w.id, w]));
  const bySentence = new Map<string, Word[]>();
  const byWord = new Map<string, Sentence[]>();
  for (const s of sentences) {
    const linked = linkedWordIds(s, byHanzi)
      .map((id) => byId.get(id))
      .filter((w): w is Word => !!w);
    bySentence.set(s.id, linked);
    // A character is also used by the sentences of the words it's part of (课 in 我们上课, via 上课).
    const users = new Set(linked.map((w) => w.id));
    for (const w of linked) {
      if ([...w.hanzi].length < 2) continue;
      for (const c of new Set(w.hanzi)) {
        const ch = byHanzi.get(c);
        if (ch) users.add(ch.id);
      }
    }
    for (const id of users) byWord.set(id, [...(byWord.get(id) ?? []), s]);
  }
  return { bySentence, byWord };
}

// ---------- Migration of word examples ----------

/** Same id on every device, so two devices migrating the same word don't create two sentences. */
export const exampleSentenceId = (wordId: string) => `ex-${wordId}`;

/**
 * Words that still carry an example (from before Sentence items): each example becomes a Sentence
 * linked to the word, tagged like it (translation kept when it had one, else "needs translation").
 * An example already present as a sentence just gets the word linked. Returns the sentences to
 * add or update and the words with their example fields cleared.
 */
export function migrateExamples(words: Word[], sentences: Sentence[], now: number = Date.now()) {
  const byZh = new Map(sentences.map((s) => [s.zh.trim(), s]));
  const changed = new Map<string, Sentence>();
  const cleaned: Word[] = [];
  for (const w of words) {
    const zh = w.example?.trim();
    if (w.example === undefined && w.exampleTranslation === undefined && w.exampleRef === undefined) continue;
    cleaned.push({ ...w, example: undefined, exampleTranslation: undefined, exampleRef: undefined });
    if (!zh) continue;
    const existing = changed.get(byZh.get(zh)?.id ?? '') ?? byZh.get(zh);
    if (existing) {
      const linked: Sentence = {
        ...existing,
        wordIds: [...new Set([...(existing.wordIds ?? []), w.id])],
        translation: existing.translation || w.exampleTranslation?.trim() || '',
        updatedAt: now,
      };
      changed.set(linked.id, linked);
      byZh.set(zh, linked);
    } else {
      const s = createSentence(
        { zh, pinyin: '', translation: w.exampleTranslation ?? '', tags: w.tags, wordIds: [w.id], tatoebaId: w.exampleRef },
        now,
        exampleSentenceId(w.id),
      );
      changed.set(s.id, s);
      byZh.set(zh, s);
    }
  }
  return { sentences: [...changed.values()], words: cleaned };
}

// ---------- Bulk add ----------

export const SENTENCE_PROMPT = `Extract the Chinese sentences from the attached material and output them in this exact format, one sentence per line, with no other text before or after:

chinese | pinyin | translation | tags

Rules:
- chinese: the full sentence in simplified Chinese characters, with its punctuation
- pinyin: with tone marks, syllables separated by spaces (or leave it empty)
- translation: a natural English translation (required; never use "|" inside a field)
- tags: comma-separated labels such as the lesson or topic, or leave it empty
- Every line must have exactly 3 "|" separators, even when a field is empty
- No header row, no numbering, no markdown table, no code block

Example output:
你叫什么名字？ | nǐ jiào shénme míngzi? | What is your name? | lesson 1
我是学生。 |  | I am a student. | lesson 1`;

export const DIALOGUE_PROMPT = `The attached photo or file is a Chinese lesson (for example a textbook page or lesson slide). Output its dialogue (课文) in this exact format, one line of the dialogue per line, in order, with no other text before or after:

speaker: chinese | pinyin | translation | tags

Then, if the lesson also has extra example sentences (例句, exercises, sentences in the vocabulary list), write a line with only "--- examples" and list them after it in the same format, without a speaker.

Rules:
- speaker: the speaker label as in the lesson (A, B, or a name such as 王老师); leave it out if there is none
- chinese: the full sentence in simplified Chinese characters, with its punctuation
- pinyin: with tone marks, syllables separated by spaces (or leave it empty)
- translation: a natural English translation (required; never use "|" inside a field)
- tags: comma-separated labels such as the lesson, or leave it empty
- Every line must have exactly 3 "|" separators, even when a field is empty
- No title line, no header row, no numbering, no markdown table, no code block

Example output:
A: 你好！ | nǐ hǎo! | Hello! | lesson 1
B: 你好！你叫什么名字？ | nǐ hǎo! nǐ jiào shénme míngzi? | Hello! What is your name? | lesson 1
A: 我叫王明。 | wǒ jiào Wáng Míng. | My name is Wang Ming. | lesson 1
--- examples
他叫什么名字？ |  | What is his name? | lesson 1`;

export interface SentenceRow {
  line: number;
  input: SentenceInput;
  speaker?: string;
  /** In a dialogue paste: after the "--- examples" line (not a line of the dialogue). */
  extra?: boolean;
}

export interface SentenceBulkResult {
  rows: SentenceRow[];
  errors: { line: number; text: string; reason: string }[];
}

const EXTRA_MARKER = /^-{2,}\s*(examples?|例句|extra)/i;
/** "A:", "Wang Ming:", "王老师：" before the sentence of a dialogue line. */
const SPEAKER = /^([A-Za-z][A-Za-z0-9 .]{0,15}|[㐀-鿿·]{1,6})\s*[:：]\s*/;
const LIST_MARKER = /^\s*(?:\d+[.)、]|[-*•])\s+/;
const HEADER = /^(chinese|中文|sentence|句子|汉字)$/i;

/** Parse pasted sentences (`chinese | pinyin | translation | tags`); in a dialogue, lines may start with `A:`. */
export function parseSentenceBulk(input: string, dialogue = false): SentenceBulkResult {
  const rows: SentenceRow[] = [];
  const errors: SentenceBulkResult['errors'] = [];
  let extra = false;
  const text = input.replace(/^﻿/, '').replace(/^```[a-z]*\s*\n?|\n?```\s*$/gi, '');
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let t = raw.trim();
    if (!t || t.startsWith('```') || /^\|?\s*:?-{2,}\s*\|/.test(t)) return;
    if (EXTRA_MARKER.test(t)) {
      extra = true;
      return;
    }
    if (!t.includes('|')) {
      if (CJK.test(t)) errors.push({ line, text: t, reason: 'no "|" separators' });
      return; // chatbot chatter
    }
    t = t.replace(LIST_MARKER, '').replace(/\*\*/g, '');
    let speaker: string | undefined;
    if (dialogue) {
      const m = t.match(SPEAKER);
      // Only a label before the Chinese text, not the start of the sentence itself.
      if (m && t.slice(m[0].length).trim()) {
        speaker = m[1];
        t = t.slice(m[0].length);
      }
    }
    const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const zh = cells[0];
    if (HEADER.test(zh)) return;
    if (!CJK.test(zh)) return void errors.push({ line, text: t, reason: 'first column has no Chinese characters' });
    let pinyin = cells[1] ?? '';
    let translation = cells[2] ?? '';
    let tagText = cells.slice(3).join(',');
    // Short rows "chinese | translation": the second cell isn't pinyin.
    if (cells.length === 2 && !looksLikePinyin(pinyin)) [pinyin, translation, tagText] = ['', pinyin, ''];
    if (!translation) return void errors.push({ line, text: t, reason: 'missing translation' });
    rows.push({
      line,
      input: { zh, pinyin: normalizeSentencePinyin(pinyin, zh), translation, tags: parseTagText(tagText) },
      speaker: dialogue && !extra ? speaker : undefined,
      extra: dialogue ? extra || undefined : undefined,
    });
  });
  return { rows, errors };
}

function looksLikePinyin(cell: string): boolean {
  return !!cell && /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]|[a-z]+[1-5]/i.test(cell) && !/\b(the|is|a|an|to|of|you|i)\b/i.test(cell);
}

function normalizeSentencePinyin(p: string, zh: string): string {
  const cleaned = p.replace(/\s+/g, ' ').trim();
  if (!cleaned) return toPinyin(zh);
  if (/[a-z][1-5]/i.test(cleaned)) return convert(cleaned, { format: 'numToSymbol' });
  return cleaned;
}

// ---------- Filling in missing translations ----------

export function translationPrompt(list: Sentence[]): string {
  return `Translate these Chinese sentences into natural English. Output one line per sentence in this exact format, keeping the Chinese exactly as given, with no other text before or after:

chinese | translation

${list.map((s) => `${s.zh} |`).join('\n')}`;
}

/** `chinese | translation` lines → translation per sentence id (matched on the Chinese text). */
export function parseTranslations(input: string, list: Sentence[]): Map<string, string> {
  const norm = (s: string) => s.replace(/\s+/g, '').trim();
  const byZh = new Map(list.map((s) => [norm(s.zh), s.id]));
  const out = new Map<string, string>();
  for (const raw of input.split(/\r?\n/)) {
    const cells = raw.replace(LIST_MARKER, '').split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    const id = byZh.get(norm(cells[0]));
    const translation = cells[cells.length - 1];
    if (id && translation && !CJK.test(translation)) out.set(id, translation);
  }
  return out;
}
