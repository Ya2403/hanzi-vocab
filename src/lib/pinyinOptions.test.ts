import { describe, expect, it } from 'vitest';
import { checkPinyin, tonelessPinyin } from './answer';
import { pinyinDistractors, stripTones } from './pinyinOptions';
import type { Word } from './types';

const w = (hanzi: string, pinyin: string): Word => ({ id: hanzi, hanzi, pinyin, meaning: hanzi, tags: [], createdAt: 0, updatedAt: 0, skills: {} });
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('pinyinDistractors', () => {
  const pool = [w('好', 'hǎo'), w('号', 'hào'), w('老', 'lǎo'), w('喝', 'hē'), w('猫', 'māo'), w('学生', 'xuésheng'), w('先生', 'xiānsheng'), w('朋友', 'péngyou')];

  it('never offers the same syllables with other tones', () => {
    for (let i = 0; i < 20; i++) {
      const d = pinyinDistractors(pool[0], pool, 3, rnd);
      expect(d).toHaveLength(3);
      expect(d.map(tonelessPinyin)).not.toContain('hao');
      expect(new Set(d.map(tonelessPinyin)).size).toBe(3);
    }
  });

  it('prefers similar sounds: same initial or final, same length', () => {
    const d = pinyinDistractors(pool[5], pool, 1, rnd);
    expect(d).toEqual(['xiānsheng']);
    const single = pinyinDistractors(pool[0], pool, 2, () => 0);
    expect(single.every((p) => /^(h|.*ao)/.test(tonelessPinyin(p)))).toBe(true);
  });

  it('never offers another reading of the same character', () => {
    for (let i = 0; i < 20; i++) {
      const d = pinyinDistractors(w('行', 'xíng'), [w('航', 'háng'), w('星', 'xīng')], 3, rnd);
      expect(d.map(tonelessPinyin)).not.toContain('hang');
      expect(d.map(tonelessPinyin)).not.toContain('xing');
      expect(d).toHaveLength(3);
    }
  });

  it('tops up small lists with real syllables that share a sound', () => {
    const d = pinyinDistractors(w('猫', 'māo'), [], 3, rnd);
    expect(d).toHaveLength(3);
    for (const p of d) expect(tonelessPinyin(p)).toMatch(/^m|ao$/);
  });
});

describe('Tones setting', () => {
  it('ignore: spelling only, ü as v or u', () => {
    expect(checkPinyin('lv3', 'lǜ', 'ignore').verdict).toBe('correct');
    expect(checkPinyin('lu', 'lǜ', 'ignore').verdict).toBe('correct');
    expect(checkPinyin('ni hao', 'nǐ hǎo', 'ignore')).toEqual({ verdict: 'correct' });
    expect(checkPinyin('ni3 hao4', 'nǐ hǎo', 'ignore')).toEqual({ verdict: 'correct' });
    expect(checkPinyin('ni hau', 'nǐ hǎo', 'ignore').verdict).toBe('wrong');
  });

  it('show: wrong tones accepted but recorded', () => {
    expect(checkPinyin('ni3 hao4', 'nǐ hǎo', 'show')).toMatchObject({ verdict: 'correct', toneError: true });
    expect(checkPinyin('ni3 hao3', 'nǐ hǎo', 'show')).toEqual({ verdict: 'correct' });
    expect(checkPinyin('ni hao', 'nǐ hǎo', 'show')).toEqual({ verdict: 'correct' });
  });

  it('required: wrong tones are close', () => {
    expect(checkPinyin('ni3 hao4', 'nǐ hǎo', 'required')).toMatchObject({ verdict: 'close', toneError: true });
    expect(checkPinyin('nǐhǎo', 'nǐ hǎo', 'required').verdict).toBe('correct');
  });

  it('strips tone marks but keeps ü', () => {
    expect(stripTones('lǜ shī')).toBe('lü shi');
  });
});
