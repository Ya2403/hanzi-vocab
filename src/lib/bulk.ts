import { convert } from 'pinyin-pro';
import { parseImport } from './io';
import { normalizeSearch, toPinyin } from './pinyin';
import { parseTagText } from './words';
import type { WordInput } from './types';

/**
 * Prompt for ChatGPT/Claude/etc. The app parses exactly this format, and is lenient
 * about the usual deviations (markdown tables, numbering, code fences, header rows).
 */
export const BULK_PROMPT = `Extract the Chinese vocabulary from the attached material and output it in this exact format, one word per line, with no other text before or after:

hanzi | pinyin | meaning | example sentence | tags

Rules:
- hanzi: the word in simplified Chinese characters
- pinyin: with tone marks, syllables separated by spaces (e.g. nǐ hǎo)
- meaning: short English meaning; separate multiple senses with ";" (never use "|" inside a field)
- example sentence: one short, natural Chinese sentence using the word, or leave it empty
- tags: comma-separated labels such as the lesson or topic, or leave it empty
- Every line must have exactly 4 "|" separators, even when a field is empty
- No header row, no numbering, no markdown table, no code block
- Include each word only once

Example output:
你好 | nǐ hǎo | hello | 你好，我叫小明。 | greetings
猫 | māo | cat |  | animals
图书馆 | tú shū guǎn | library | 我在图书馆看书。 | places, lesson 3`;

export interface BulkRow {
  line: number;
  word: WordInput;
}

export interface BulkError {
  line: number;
  text: string;
  reason: string;
}

export interface BulkResult {
  rows: BulkRow[];
  errors: BulkError[];
}

const CJK = /[㐀-鿿豈-﫿]/;
const HEADER = /^(hanzi|chinese|汉字|中文|词语?|words?|characters?|simplified)$/i;
const SEPARATOR_ROW = /^\|?\s*:?-{2,}/;
const LIST_MARKER = /^\s*(?:\d+[.)、]|[-*•])\s+/;

export function parseBulk(input: string): BulkResult {
  const text = input.replace(/^﻿/, '').trim();
  if (!text) return { rows: [], errors: [] };

  const unfenced = text.replace(/^```[a-z]*\s*\n?|\n?```\s*$/gi, '').trim();
  if (unfenced.startsWith('[') || unfenced.startsWith('{')) {
    try {
      return fromJson(unfenced);
    } catch {
      /* not JSON after all: fall through to line parsing */
    }
  }

  const rows: BulkRow[] = [];
  const errors: BulkError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('```') || SEPARATOR_ROW.test(trimmed)) return;
    const result = parseLine(trimmed);
    if (result === null) return;
    if (typeof result === 'string') errors.push({ line, text: trimmed, reason: result });
    else rows.push({ line, word: result });
  });
  return { rows, errors };
}

function fromJson(text: string): BulkResult {
  const { words, invalid } = parseImport(text);
  return {
    rows: words.map((w, i) => ({
      line: i + 1,
      word: { hanzi: w.hanzi, pinyin: w.pinyin, meaning: w.meaning, example: w.example, tags: w.tags },
    })),
    errors: invalid ? [{ line: 0, text: `${invalid} JSON entr${invalid === 1 ? 'y' : 'ies'}`, reason: 'missing hanzi or meaning' }] : [],
  };
}

/** A word, an error message, or null for lines to skip silently (headers). */
function parseLine(line: string): WordInput | string | null {
  let cells: string[];
  if (line.includes('|')) cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|');
  else if (line.includes('\t')) cells = line.split('\t');
  // Chatbot chatter ("Sure! Here is your list:") has no Chinese; ignore it quietly.
  else return CJK.test(line) ? 'no "|" separators' : null;
  cells = cells.map((c) => c.trim());
  cells[0] = cells[0].replace(LIST_MARKER, '').replace(/\*\*/g, '');

  const hanzi = cells[0];
  if (HEADER.test(hanzi)) return null;
  if (!CJK.test(hanzi)) return 'first column has no Chinese characters';

  let pinyin = '';
  let meaning = '';
  let example = '';
  let tags: string[] = [];

  if (cells.length >= 5) {
    [, pinyin, meaning, example] = cells;
    tags = parseTagText(cells.slice(4).join(','));
  } else {
    // Short rows: pinyin is optional, and the example is whichever later cell contains Chinese.
    const rest = cells.slice(1);
    if (looksLikePinyin(rest[0], hanzi)) pinyin = rest.shift()!;
    meaning = rest.shift() ?? '';
    for (const cell of rest) {
      if (!example && CJK.test(cell)) example = cell;
      else if (cell) tags = [...tags, ...parseTagText(cell)];
    }
  }

  if (!meaning) return 'missing meaning';
  return { hanzi, pinyin: normalizePinyin(pinyin, hanzi), meaning, example: example || undefined, tags };
}

function looksLikePinyin(cell: string | undefined, hanzi: string): boolean {
  if (!cell || CJK.test(cell)) return false;
  const bare = (s: string) => normalizeSearch(s).replace(/[\d'’·-]/g, '').replace(/v/g, 'u');
  return bare(cell) === bare(toPinyin(hanzi));
}

/** Accept tone marks as-is, convert tone numbers (ni3 hao3), or generate when missing. */
function normalizePinyin(p: string, hanzi: string): string {
  const cleaned = p.replace(/\s+/g, ' ').trim();
  if (!cleaned) return toPinyin(hanzi);
  if (/[1-5]/.test(cleaned)) return convert(cleaned, { format: 'numToSymbol' });
  return cleaned;
}
