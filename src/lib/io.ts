import { isValidDateStr, today } from './date';
import { migrateLegacySrs, newSrs } from './srs';
import { toPinyin } from './pinyin';
import { newId, normalizeTags } from './words';
import { SKILLS, type Dialogue, type Sentence, type SkillState, type Skills, type Word } from './types';

const FORMAT = 'hanzi-vocab';
/**
 * 2: per-skill schedules (`skills`). Version 1 files (one `srs` schedule) are migrated on import.
 * 3: sentences and dialogues. Older files' word examples become sentences (in the store).
 */
const VERSION = 3;

export interface ExportData {
  words: Word[];
  sentences: Sentence[];
  dialogues: Dialogue[];
}

export function exportData({ words, sentences, dialogues }: ExportData): void {
  const data = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), words, sentences, dialogues };
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
export function parseImport(text: string): ExportData & { invalid: number; hasSentences: boolean } {
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
  const obj = (Array.isArray(data) ? {} : data) as { sentences?: unknown; dialogues?: unknown };
  const sentences = (Array.isArray(obj.sentences) ? obj.sentences : [])
    .map((raw, i) => normalizeSentence(raw, now + i))
    .filter((x): x is Sentence => !!x);
  const ids = new Set(sentences.map((x) => x.id));
  const dialogues = (Array.isArray(obj.dialogues) ? obj.dialogues : [])
    .map((raw, i) => normalizeDialogue(raw, now + i, ids))
    .filter((x): x is Dialogue => !!x);
  return { words, sentences, dialogues, invalid, hasSentences: Array.isArray(obj.sentences) };
}

/** A sentence from a file or another device (needs Chinese text; a missing translation stays empty). */
export function normalizeSentence(raw: unknown, fallbackTime: number = Date.now()): Sentence | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const zh = str(r.zh);
  if (!zh) return null;
  const ids = Array.isArray(r.wordIds) ? r.wordIds.filter((x): x is string => typeof x === 'string') : [];
  return {
    id: str(r.id) || newId(),
    zh,
    pinyin: str(r.pinyin) || toPinyin(zh),
    translation: str(r.translation),
    tags: normalizeTags(Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : []),
    notes: str(r.notes) || undefined,
    dialogueId: str(r.dialogueId) || undefined,
    wordIds: ids.length ? ids : undefined,
    tatoebaId: typeof r.tatoebaId === 'number' ? r.tatoebaId : undefined,
    createdAt: num(r.createdAt, fallbackTime),
    updatedAt: num(r.updatedAt, fallbackTime),
  };
}

/** A dialogue; lines pointing at sentences that aren't in the file are dropped. */
export function normalizeDialogue(raw: unknown, fallbackTime: number = Date.now(), sentenceIds?: Set<string>): Dialogue | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lines = (Array.isArray(r.lines) ? r.lines : [])
    .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : null))
    .filter((l): l is Record<string, unknown> => !!l && !!str(l.sentenceId) && (!sentenceIds || sentenceIds.has(str(l.sentenceId))))
    .map((l) => ({ sentenceId: str(l.sentenceId), speaker: str(l.speaker) || undefined }));
  return {
    id: str(r.id) || newId(),
    title: str(r.title) || 'Dialogue',
    tags: normalizeTags(Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : []),
    lines,
    createdAt: num(r.createdAt, fallbackTime),
    updatedAt: num(r.updatedAt, fallbackTime),
  };
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
