import { describe, expect, it } from 'vitest';
import { computeCharLinks, detectKind, entryChars, lockingChars, missingChars, reconcileKind, recordWordAnswer, unlockChanges } from './entries';
import { activeSkills, isLearned, newSrs } from './srs';
import type { Word } from './types';

const st = () => ({ ...newSrs('2026-10-01'), interval: 5, reps: 3, answered: 3, correct: 2, recent: '101', lastSeen: 50 });
const w = (hanzi: string, learned: boolean, extra: Partial<Word> = {}): Word => ({
  id: hanzi,
  hanzi,
  pinyin: 'x',
  meaning: hanzi,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  skills: learned ? { meaning: st(), pinyin: st(), recall: st() } : {},
  ...extra,
});

describe('entry kinds', () => {
  it('detects characters, words and names', () => {
    expect(detectKind(w('课', false))).toBe('char');
    expect(detectKind(w('氵', false))).toBe('char');
    expect(detectKind(w('上课', false))).toBe('word');
    expect(detectKind(w('对…说', false))).toBe('word');
    expect(detectKind(w('好', false, { tags: ['phrases'] }))).toBe('word');
    expect(detectKind(w('王一飞', false, { tags: ['names'] }))).toBe('name');
    expect(entryChars('对…说对')).toEqual(['对', '说']);
  });

  it('words have no schedule and are learned once unlocked', () => {
    const word = w('上课', false);
    expect(activeSkills(word)).toEqual([]);
    expect(isLearned(word)).toBe(false);
    expect(isLearned({ ...word, unlockedOn: '2026-10-14' })).toBe(true);
  });
});

describe('words and their characters', () => {
  const list = [w('上', true), w('课', false), w('电', true), w('上课', false), w('电脑', false), w('下课', false)];

  it('links words to their characters both ways', () => {
    const links = computeCharLinks(list);
    expect(links.charsOf.get('电脑')!.map((s) => [s.char, s.entry?.id])).toEqual([
      ['电', '电'],
      ['脑', undefined],
    ]);
    expect(links.usedIn.get('课')!.map((x) => x.hanzi)).toEqual(['上课', '下课']);
    expect(missingChars(links.charsOf.get('电脑')!)).toEqual(['脑']);
    expect(lockingChars(links.charsOf.get('上课')!)).toEqual(['课']);
  });

  it('unlocks a word when its last character is learned, and locks it again', () => {
    expect(unlockChanges(list, '2026-10-14')).toEqual([]);
    const learnedKe = list.map((x) => (x.hanzi === '课' ? w('课', true) : x));
    expect(unlockChanges(learnedKe, '2026-10-14').map((x) => [x.hanzi, x.unlockedOn])).toEqual([['上课', '2026-10-14']]);
    const unlocked = list.map((x) => (x.hanzi === '上课' ? { ...x, unlockedOn: '2026-10-01' } : x));
    expect(unlockChanges(unlocked, '2026-10-14').map((x) => [x.hanzi, x.unlockedOn])).toEqual([['上课', undefined]]);
  });
});

describe('background statistics', () => {
  it('flags a miss as needing work until 2 right answers in a row', () => {
    let word = recordWordAnswer(w('东西', false), false, 1);
    expect(word.stats).toMatchObject({ answered: 1, correct: 0, recent: '0', needsWork: true });
    word = recordWordAnswer(word, true, 2);
    expect(word.stats!.needsWork).toBe(true);
    word = recordWordAnswer(word, true, 3);
    expect(word.stats!.needsWork).toBeUndefined();
    expect(word.stats).toMatchObject({ answered: 3, correct: 2, recent: '011', lastSeen: 3 });
  });

  it('moves a word’s old skills aside, and gives a character them back', () => {
    const old = w('学生', true);
    const word = reconcileKind(old);
    expect(word.skills).toEqual({});
    expect(word.legacySkills).toEqual(old.skills);
    expect(word.stats).toMatchObject({ answered: 9, correct: 6 });
    expect(reconcileKind(word)).toBe(word);
    const asChar = reconcileKind({ ...word, kind: 'char' });
    expect(asChar.skills).toEqual(old.skills);
    expect(asChar.legacySkills).toBeUndefined();
  });
});

describe('missing characters', () => {
  it('become characters with the word’s tags (but not "names")', async () => {
    const { missingCharInputs } = await import('./hanziDict');
    const got = missingCharInputs(
      [
        { char: '王', from: '王一飞', tags: ['names', 'L1'] },
        { char: '王', from: '王明', tags: ['names'] },
      ],
      null,
    );
    expect(got).toEqual([{ hanzi: '王', pinyin: 'wáng', meaning: '(character in 王一飞)', tags: ['L1'] }]);
    expect(detectKind(got[0])).toBe('char');
  });
});
