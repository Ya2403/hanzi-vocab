import type { Word, WordInput } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanInput(input: WordInput): WordInput {
  const notes = input.notes?.trim();
  return {
    hanzi: normalizePlaceholders(input.hanzi.trim()),
    pinyin: input.pinyin.trim().replace(/\s+/g, ' '),
    meaning: input.meaning.trim(),
    notes: notes || undefined,
    tags: normalizeTags(input.tags),
    kind: input.kind,
  };
}

/** `createdAt` can be given so words added together keep their order (Learn mode teaches in added order). */
export function createWord(input: WordInput, createdAt: number = Date.now()): Word {
  return { id: newId(), ...cleanInput(input), createdAt, updatedAt: createdAt, skills: {} };
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

// ---------- Placeholders ----------

/** "…" in an entry stands for someone/something: 对…说, 给…打电话. */
export const PLACEHOLDER = '…';

/** "...", "⋯", "……" and "。。。" typed in an entry all become one "…". */
export const normalizePlaceholders = (s: string): string => s.replace(/\.{2,}|。{2,}|⋯+|…+/g, PLACEHOLDER);

export const hasPlaceholder = (s: string): boolean => s.includes(PLACEHOLDER);

/** The text with placeholders removed (for audio, matching and character lists). */
export const withoutPlaceholders = (s: string): string => s.split(PLACEHOLDER).join('');
