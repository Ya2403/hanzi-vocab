import { isValidDateStr, today } from './date';
import { migrateLegacySrs, newSrs } from './srs';
import { toPinyin } from './pinyin';
import { newId, normalizeTags } from './words';
import { SKILLS, type SkillState, type Skills, type Word } from './types';

const FORMAT = 'hanzi-vocab';
/** 2: per-skill schedules (`skills`). Version 1 files (one `srs` schedule) are migrated on import. */
const VERSION = 2;

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
  const now = Date.now();
  for (const [i, raw] of list.entries()) {
    // Entries without a timestamp get consecutive ones, keeping the file's order.
    const w = normalizeWord(raw, now + i);
    if (w) words.push(w);
    else invalid++;
  }
  return { words, invalid };
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Validate and fill in one word (from a file, the local database or another device). Words
 * from before skills (a single `srs` schedule) are migrated: see migrateLegacySrs.
 */
export function normalizeWord(raw: unknown, fallbackTime: number = Date.now(), on: string = today()): Word | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const hanzi = str(r.hanzi);
  const meaning = str(r.meaning);
  if (!hanzi || !meaning) return null;
  const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [];
  const id = str(r.id) || newId();
  let skills: Skills;
  let learnedOn = isValidDateStr(r.learnedOn) ? r.learnedOn : undefined;
  if (r.skills && typeof r.skills === 'object') {
    skills = {};
    for (const k of SKILLS) {
      const v = (r.skills as Record<string, unknown>)[k];
      if (v && typeof v === 'object') {
        const { learnedOn: _legacy, ...state } = normalizeSrs(v);
        skills[k] = state;
      }
    }
  } else {
    const legacy = normalizeSrs(r.srs);
    const m = migrateLegacySrs(id, hanzi, legacy, on);
    skills = m.skills;
    learnedOn ??= m.learnedOn;
  }
  return {
    id,
    hanzi,
    pinyin: str(r.pinyin) || toPinyin(hanzi),
    meaning,
    example: str(r.example) || undefined,
    exampleTranslation: str(r.exampleTranslation) || undefined,
    exampleRef: typeof r.exampleRef === 'number' ? r.exampleRef : undefined,
    notes: str(r.notes) || undefined,
    tags: normalizeTags(tags),
    createdAt: num(r.createdAt, fallbackTime),
    updatedAt: num(r.updatedAt, fallbackTime),
    skills,
    learnedOn: skills.meaning ? learnedOn : undefined,
    toneErrors: typeof r.toneErrors === 'number' && r.toneErrors > 0 ? Math.round(r.toneErrors) : undefined,
  };
}

/** Stored or synced words written before skills existed need migrating. */
export const isLegacyWord = (w: unknown): boolean => !!w && typeof w === 'object' && !('skills' in w);

function normalizeSrs(raw: unknown): SkillState & { learnedOn?: string } {
  const base = newSrs();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' ? Math.max(0, Math.round(v)) : undefined);
  return {
    ease: Math.max(1.3, num(r.ease, base.ease)),
    interval: Math.max(0, Math.round(num(r.interval, 0))),
    reps: Math.max(0, Math.round(num(r.reps, 0))),
    lapses: Math.max(0, Math.round(num(r.lapses, 0))),
    due: isValidDateStr(r.due) ? r.due : base.due,
    lastReviewed: isValidDateStr(r.lastReviewed) ? r.lastReviewed : undefined,
    answered: count(r.answered),
    correct: count(r.correct),
    recent: typeof r.recent === 'string' && /^[01]{0,5}$/.test(r.recent) ? r.recent : undefined,
    lastSeen: typeof r.lastSeen === 'number' ? r.lastSeen : undefined,
    leech: r.leech === true || undefined,
    lapsesAtUnmark: count(r.lapsesAtUnmark),
    // Legacy single schedules kept the learned date here.
    learnedOn: isValidDateStr(r.learnedOn) ? r.learnedOn : undefined,
  };
}
