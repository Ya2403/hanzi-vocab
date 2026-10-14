import { describe, expect, it } from 'vitest';
import { chatOptions, translationDistractors, whichCharQuestion } from './choiceExercises';
import { createSentence } from './sentences';
import { newSrs } from './srs';
import type { Dialogue, Sentence, Word } from './types';

const st = () => ({ ...newSrs('2026-10-01'), interval: 5, reps: 3 });
const e = (hanzi: string, meaning = hanzi, tags: string[] = [], learned = true): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning,
  tags,
  createdAt: 0,
  updatedAt: 0,
  skills: learned && [...hanzi].length === 1 ? { meaning: st(), pinyin: st(), recall: st() } : {},
  unlockedOn: learned && [...hanzi].length > 1 ? '2026-10-01' : undefined,
});
const fixed = () => 0;

describe('select the correct translation', () => {
  it('prefers look-alikes (and for words, words sharing a character), never the same meaning', () => {
    const pool = [e('大', 'big'), e('太', 'too'), e('犬', 'dog'), e('人', 'person', ['L1']), e('电话', 'phone'), e('电影', 'film'), e('手机', 'mobile'), e('大人', 'big')];
    expect(translationDistractors(pool[0], pool, null, 2, fixed).map((w) => w.hanzi).sort()).toEqual(['太', '犬']);
    const computer = e('电脑', 'computer');
    expect(translationDistractors(computer, [...pool, computer], null, 2, fixed).map((w) => w.hanzi).sort()).toEqual(['电影', '电话']);
  });
});

describe('which character?', () => {
  const list = [e('电'), e('脑'), e('话'), e('手'), e('机'), e('人'), e('电脑', 'computer', ['L4']), e('电话', 'phone'), e('大', 'big', ['L4'])];
  it('blanks the target and never offers a character that makes another word', () => {
    const q = whichCharQuestion(list[6], '脑', list, null, fixed)!;
    expect(q.blank).toBe(1);
    expect(q.answer).toBe('脑');
    expect(q.options).toContain('脑');
    expect(q.options).not.toContain('话'); // 电话 is a word too
    expect(q.options).not.toContain('电'); // already in the word
    expect(new Set(q.options).size).toBe(4);
  });
});

describe('complete the chat', () => {
  const s = (zh: string): Sentence => createSentence({ zh, pinyin: '', translation: zh, tags: [] }, 0, zh);
  const a = [s('你好！'), s('你叫什么名字？'), s('我叫王明。')];
  const b = [s('你是学生吗？'), s('我是学生。'), s('他是老师。')];
  const all = [...a, ...b];
  const d = (id: string, lines: Sentence[], tags: string[]): Dialogue => ({ id, title: id, tags, lines: lines.map((x) => ({ sentenceId: x.id })), createdAt: 0, updatedAt: 0 });
  const d1 = d('d1', a, ['L1']);
  const d2 = d('d2', b, ['L1']);

  it('offers the real reply and lines from another dialogue of the same lesson', () => {
    const opts = chatOptions(d1, a, 2, [d1, d2], all, fixed)!;
    expect(opts.map((x) => x.zh)).toContain('我叫王明。');
    expect(opts.length).toBeGreaterThanOrEqual(2);
    for (const o of opts) if (o.zh !== '我叫王明。') expect(b.map((x) => x.zh)).toContain(o.zh);
  });

  it('needs a dialogue with at least 3 lines and a line before', () => {
    expect(chatOptions(d1, a, 0, [d1, d2], all, fixed)).toBeNull();
    expect(chatOptions(d('short', a.slice(0, 2), []), a.slice(0, 2), 1, [d1, d2], all, fixed)).toBeNull();
  });
});
