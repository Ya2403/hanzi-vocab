import { describe, expect, it } from 'vitest';
import { toneVariants } from './pinyin';

describe('toneVariants', () => {
  it('changes the tone of a single syllable', () => {
    expect(toneVariants('hǎo', 10).sort()).toEqual(['hāo', 'háo', 'hào'].sort());
  });

  it('changes one syllable at a time in multi-syllable words', () => {
    const v = toneVariants('nǐ hǎo', 10);
    expect(v).toHaveLength(6);
    expect(v).toContain('ní hǎo');
    expect(v).toContain('nǐ hào');
    expect(v).not.toContain('nǐ hǎo');
  });

  it('keeps ü intact', () => {
    expect(toneVariants('lǜ', 10).sort()).toEqual(['lǖ', 'lǘ', 'lǚ'].sort());
  });

  it('skips neutral-tone syllables and respects the limit', () => {
    expect(toneVariants('xǐ huan', 10).sort()).toEqual(['xī huan', 'xí huan', 'xì huan'].sort());
    expect(toneVariants('nǐ hǎo', 2)).toHaveLength(2);
    expect(toneVariants('ma')).toEqual([]);
  });
});
