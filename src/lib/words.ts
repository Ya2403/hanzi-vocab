import { newSrs } from './srs';
import type { Word, WordInput } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanInput(input: WordInput): WordInput {
  const example = input.example?.trim();
  return {
    hanzi: input.hanzi.trim(),
    pinyin: input.pinyin.trim().replace(/\s+/g, ' '),
    meaning: input.meaning.trim(),
    example: example || undefined,
    tags: normalizeTags(input.tags),
  };
}

export function createWord(input: WordInput): Word {
  const now = Date.now();
  return { id: newId(), ...cleanInput(input), createdAt: now, updatedAt: now, srs: newSrs() };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Split "HSK1, food，动物" on ASCII/Chinese commas. */
export function parseTagText(text: string): string[] {
  return normalizeTags(text.split(/[,，、;]/));
}

export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
