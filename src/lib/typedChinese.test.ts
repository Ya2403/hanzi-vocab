import { describe, expect, it } from 'vitest';
import { checkTypedChinese, missedChars } from './typedChinese';

describe('typed Chinese verdict', () => {
  it('is correct when exact (spaces, punctuation and full-width characters ignored)', () => {
    expect(checkTypedChinese('我想吃包子。', '我想吃 包子').verdict).toBe('correct');
    expect(checkTypedChinese('我有ＡＢ。', '我有AB').verdict).toBe('correct');
  });

  it('gives "almost" for one wrong character in an answer of 6+ characters', () => {
    const r = checkTypedChinese('我明天去北京看朋友。', '我明天去北京看朋有');
    expect(r.verdict).toBe('almost');
    expect(missedChars(r.parts)).toEqual(['友']);
    expect(checkTypedChinese('我想吃包子。', '我想吃包了').verdict).toBe('wrong'); // only 5 characters
    expect(checkTypedChinese('我明天去北京看朋友。', '我明天去上海看朋友').verdict).toBe('wrong'); // two wrong
  });

  it('accepts "…" placeholders and stored alternatives', () => {
    expect(checkTypedChinese('对…说', '对他说').verdict).toBe('correct');
    expect(checkTypedChinese('我是学生。', '我是一个学生', { alternatives: ['我是一个学生。'] }).verdict).toBe('correct');
  });

  it('dictation accepts other characters with the same sound', () => {
    expect(checkTypedChinese('是', '事', { sameSound: true })).toMatchObject({ verdict: 'correct', note: 'Same sound, other characters' });
    expect(checkTypedChinese('是', '事').verdict).toBe('wrong');
  });
});
