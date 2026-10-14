import { describe, expect, it } from 'vitest';
import { hanziMatches } from './answer';
import { cleanInput, normalizePlaceholders } from './words';

describe('typed characters', () => {
  it('ignores spaces and punctuation', () => {
    expect(hanziMatches('你 好！', '你好')).toBe(true);
    expect(hanziMatches('你们好', '你好')).toBe(false);
  });

  it('treats "…" as someone/something', () => {
    expect(hanziMatches('对说', '对…说')).toBe(true);
    expect(hanziMatches('对他说', '对…说')).toBe(true);
    expect(hanziMatches('给妈妈打电话', '给…打电话')).toBe(true);
    expect(hanziMatches('他说', '对…说')).toBe(false);
  });

  it('stores any spelling of the placeholder as one "…"', () => {
    expect(normalizePlaceholders('对...说')).toBe('对…说');
    expect(normalizePlaceholders('对……说')).toBe('对…说');
    expect(cleanInput({ hanzi: ' 给...打电话 ', pinyin: 'gěi … dǎ diànhuà', meaning: 'to call', tags: [] }).hanzi).toBe('给…打电话');
  });
});
