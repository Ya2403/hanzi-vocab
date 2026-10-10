import { describe, expect, it } from 'vitest';
import { contextCardFor, contextSentences, dialoguePositions, diffChars, normalizeZh, withContext, wordResults, type ContextWorld } from './contextReview';
import { computeLinks, createSentence } from './sentences';
import { newSrs } from './srs';
import type { Step } from './planner';
import type { Dialogue, Sentence, SkillState, Word } from './types';

const ON = '2026-10-12';
const st = (interval: number, reps = 3): SkillState => ({ ...newSrs(ON), interval, reps, due: '2026-12-01', lastReviewed: '2026-10-10' });
const w = (hanzi: string, interval: number | null): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: interval === null ? {} : { meaning: st(interval), pinyin: st(interval), recall: st(interval) },
});
const s = (zh: string, extra: Partial<Sentence> = {}): Sentence => ({ ...createSentence({ zh, pinyin: 'x', translation: `EN ${zh}`, tags: [] }, 0, zh), ...extra });

describe('typed Chinese', () => {
  it('ignores spaces and punctuation, and converts full-width characters', () => {
    expect(normalizeZh('我 是，学生！ ＡＢ１２')).toBe('我是学生AB12');
  });

  it('shows missing, extra and wrong characters', () => {
    const d = diffChars('我是学生', '我是生学生');
    expect(d.filter((p) => p.kind !== 'ok').map((p) => [p.kind, p.ch])).toEqual([['extra', '生']]);
    expect(diffChars('我是学生', '我学生').map((p) => p.kind)).toEqual(['ok', 'missing', 'ok', 'ok']);
    expect(diffChars('我是学生', '我是学先').filter((p) => p.kind === 'wrong')).toEqual([{ ch: '生', kind: 'wrong', got: '先', at: 3 }]);
  });

  it('tells which words of a reply were wrong or missing', () => {
    const words = [w('我', 10), w('是', 10), w('学生', 10)];
    const r = wordResults('我是学生。', '我不学生', words);
    expect([...r]).toEqual([
      ['我', true],
      ['是', false],
      ['学生', true],
    ]);
  });
});

describe('choosing a sentence and an exercise', () => {
  const words = [w('我', 10), w('是', 10), w('学生', null), w('老师', 30), w('你', 10), w('好', 10), { ...w('叫', 1), skills: { meaning: st(1, 1), pinyin: st(1, 1), recall: st(1, 1) } }, w('什么', 10), w('名字', 10), w('猫', null)];
  const lines = [s('你好！'), s('你叫什么名字？'), s('我是学生。')];
  const loose = [s('我是老师。'), s('我有一只猫。')];
  const all = [...lines, ...loose];
  const d: Dialogue = { id: 'd', title: 'd', tags: [], lines: lines.map((x) => ({ sentenceId: x.id })), createdAt: 0, updatedAt: 0 };
  const pos = dialoguePositions([d], all);
  const world: ContextWorld = { links: computeLinks(all, words), lineOf: (id) => pos.get(id) };
  const byHanzi = (h: string) => words.find((x) => x.hanzi === h)!;

  it('prefers sentences where every other word is learned', () => {
    expect(contextSentences(byHanzi('我'), world).map((x) => x.zh)).toEqual(['我是老师。']); // 学生 isn't learned
    // Only linked words count: 有 and 只 aren't in the list, so this is i+1 for 猫.
    expect(contextSentences(byHanzi('猫'), world).map((x) => x.zh)).toEqual(['我有一只猫。']);
  });

  it('weak → fill the blank with options; strong recall → typed reply in the dialogue', () => {
    expect(contextCardFor(byHanzi('叫'), 'meaning', world, { use: 'max', rnd: () => 0, on: ON })).toMatchObject({ ex: 'cloze', part: 'choice', sentenceId: '你叫什么名字？' });
    const strong = { ...byHanzi('名字'), skills: { meaning: st(40, 6), pinyin: st(40, 6), recall: st(40, 6) } };
    expect(contextCardFor(strong, 'recall', world, { use: 'max', rnd: () => 0, on: ON })).toMatchObject({ ex: 'reply', part: 'typing', sentenceId: '你叫什么名字？' });
  });

  it('medium meaning → read and check, covering other session words in the sentence', () => {
    const card = contextCardFor(byHanzi('我'), 'meaning', world, { use: 'max', rnd: () => 0, on: ON, sessionWords: [byHanzi('是'), byHanzi('你')] });
    expect(card).toMatchObject({ ex: 'read', part: 'check', sentenceId: '我是老师。', alsoIds: ['是'] });
  });

  it('keeps pinyin as a word card, and honours "off"', () => {
    expect(contextCardFor(byHanzi('我'), 'pinyin', world, { use: 'max', on: ON })).toBeNull();
    expect(contextCardFor(byHanzi('我'), 'meaning', world, { use: 'off', on: ON })).toBeNull();
  });

  it('drops the cards of words already covered by a read-and-check', () => {
    const steps: Step[] = ['我', '是', '你'].map((h) => ({ id: h, card: { kind: 'pair', p: 'choice' }, scheduled: ['meaning', 'pinyin'] }));
    const out = withContext(steps, new Map(words.map((x) => [x.id, x])), world, { use: 'max', rnd: () => 0, on: ON });
    expect(out.map((x) => x.id)).toEqual(['我', '你']);
    expect(out[0].card).toMatchObject({ kind: 'context', ex: 'read', alsoIds: ['是'] });
  });

  it("doesn't cover a word whose planned review is recall", () => {
    const steps: Step[] = [
      { id: '我', card: { kind: 'pair', p: 'choice' }, scheduled: ['meaning', 'pinyin'] },
      { id: '是', card: { kind: 'single', ex: 'choice', skill: 'recall', dir: 'en-zh' }, scheduled: ['recall'] },
    ];
    const out = withContext(steps, new Map(words.map((x) => [x.id, x])), world, { use: 'max', rnd: () => 0, on: ON });
    expect(out.map((x) => x.id)).toEqual(['我', '是']);
    expect(out[0].card).toMatchObject({ ex: 'read' });
    expect((out[0].card as { alsoIds?: string[] }).alsoIds).toBeUndefined();
  });
});
