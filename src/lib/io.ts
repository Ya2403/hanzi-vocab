import { isValidDateStr, today } from './date';
import { newSrs } from './srs';
import { toPinyin } from './pinyin';
import { newId, normalizeTags } from './words';
import type { SrsState, Word } from './types';

const FORMAT = 'hanzi-vocab';
const VERSION = 1;

export function exportWords(words: Word[]): void {
  const data = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), words };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hanzi-vocab-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse an export file. Accepts either `{ words: [...] }` or a bare array.
 * Entries only need `hanzi` and `meaning`; everything else is filled in.
 */
export function parseImport(text: string): { words: Word[]; invalid: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const list = Array.isArray(data) ? data : (data as { words?: unknown } | null)?.words;
  if (!Array.isArray(list)) throw new Error('No "words" array found in file.');

  const words: Word[] = [];
  let invalid = 0;
  for (const raw of list) {
    const w = normalizeWord(raw);
    if (w) words.push(w);
    else invalid++;
  }
  return { words, invalid };
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function normalizeWord(raw: unknown): Word | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const hanzi = str(r.hanzi);
  const meaning = str(r.meaning);
  if (!hanzi || !meaning) return null;
  const now = Date.now();
  const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [];
  return {
    id: str(r.id) || newId(),
    hanzi,
    pinyin: str(r.pinyin) || toPinyin(hanzi),
    meaning,
    example: str(r.example) || undefined,
    notes: str(r.notes) || undefined,
    tags: normalizeTags(tags),
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    srs: normalizeSrs(r.srs),
  };
}

function normalizeSrs(raw: unknown): SrsState {
  const base = newSrs();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  return {
    ease: Math.max(1.3, num(r.ease, base.ease)),
    interval: Math.max(0, Math.round(num(r.interval, 0))),
    reps: Math.max(0, Math.round(num(r.reps, 0))),
    lapses: Math.max(0, Math.round(num(r.lapses, 0))),
    due: isValidDateStr(r.due) ? r.due : base.due,
    lastReviewed: isValidDateStr(r.lastReviewed) ? r.lastReviewed : undefined,
    leech: r.leech === true || undefined,
    lapsesAtUnmark: typeof r.lapsesAtUnmark === 'number' ? Math.max(0, Math.round(r.lapsesAtUnmark)) : undefined,
  };
}
