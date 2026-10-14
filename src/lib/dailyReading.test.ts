import { describe, expect, it } from 'vitest';
import { FOCUS_WORDS, pendingReading, previewReading, promptWords, readingPrompt } from './dailyReading';
import { normalizeDialogue } from './io';
import { newSrs } from './srs';
import type { Dialogue, SkillState, Word } from './types';

const ON = '2026-10-10';
const NOW = new Date(`${ON}T12:00:00`).getTime();
const st = (interval: number, last = '2026-10-01'): SkillState => ({ ...newSrs(ON), interval, reps: 3, due: '2026-12-01', lastReviewed: last });
const w = (hanzi: string, interval: number | null, last?: string): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  learnedOn: interval === null ? undefined : '2026-09-01',
  skills: interval === null ? {} : { meaning: st(interval, last), pinyin: st(interval, last), recall: st(interval, last) },
});
const reading = (extra: Partial<Dialogue>): Dialogue => ({ id: 'r', title: 'R', tags: ['reading'], lines: [{ sentenceId: 's' }], kind: 'reading', readingDate: ON, createdAt: 1, updatedAt: 1, ...extra });

describe('daily reading', () => {
  const words = [w('我', 30), w('是', 30), w('学', 1, '2026-09-01'), w('老', 30), w('猫', null)];

  it('lists the learned words, the ones that need practice first', () => {
    const { learned, focus } = promptWords(words, NOW);
    expect(learned.map((x) => x.hanzi)).toEqual(['我', '是', '学', '老']);
    expect(focus[0].hanzi).toBe('学');
    expect(focus.length).toBeLessThanOrEqual(FOCUS_WORDS);
    const prompt = readingPrompt(words, NOW);
    expect(prompt).toContain('我、是、学、老');
    expect(prompt).toContain('chinese | translation');
    expect(prompt).not.toContain('猫');
  });

  it('previews a pasted reading with the unknown words', () => {
    // Unlocked words count as known.
    const lesson = [w('我', 30), w('是', 30), { ...w('学生', null), unlockedOn: ON }, { ...w('老师', null), unlockedOn: ON }, w('猫', null)];
    const p = previewReading('```\n我是学生。 | I am a student.\n我是老师。 | I am a teacher.\n我有猫。 | I have a cat.\nSure! Here it is:\n```', lesson);
    expect(p.rows.map((r) => r.input.zh)).toEqual(['我是学生。', '我是老师。', '我有猫。']);
    expect(p.rows[0].input.translation).toBe('I am a student.');
    expect(p.unknown).toEqual(['有', '猫']); // 猫 is in the list but not learned
    expect(p.unknownShare).toBeCloseTo(2 / 9);
  });

  it("finds today's unfinished reading", () => {
    expect(pendingReading([reading({})], ON)?.id).toBe('r');
    expect(pendingReading([reading({ lastRead: NOW })], ON)).toBeUndefined();
    expect(pendingReading([reading({ readingDate: '2026-10-09' })], ON)).toBeUndefined();
    expect(pendingReading([reading({ kind: undefined })], ON)).toBeUndefined();
  });

  it('keeps the reading fields through import/sync', () => {
    expect(normalizeDialogue(reading({}))).toMatchObject({ kind: 'reading', readingDate: ON });
    expect(normalizeDialogue({ ...reading({}), kind: 'other' })).toMatchObject({ kind: undefined, readingDate: undefined });
  });
});
