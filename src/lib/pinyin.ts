import { pinyin } from 'pinyin-pro';

/** Tone-marked pinyin, one syllable per character, space separated (e.g. "nǐ hǎo"). */
export function toPinyin(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return pinyin(t, { toneType: 'symbol' })
    .replace(/\s+/g, ' ')
    .replace(/ ([，。！？、；：,.!?;:）)」』”])/g, '$1')
    .trim();
}

/** Lowercase, strip tone marks and whitespace so "ni hao" / "nǐhǎo" / "Nǐ Hǎo" all match. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const TONE_MARKS = ['̄', '́', '̌', '̀']; // tones 1–4 as combining marks
const TONE_MARK_RE = /[̄́̌̀]/;

/** Same syllable with a different tone mark ("hǎo", 4 → "hào"); null if it has no tone mark. */
function retone(syllable: string, tone: number): string | null {
  const d = syllable.normalize('NFD');
  const m = d.match(TONE_MARK_RE);
  if (!m) return null;
  return d.replace(m[0], TONE_MARKS[tone - 1]).normalize('NFC');
}

/**
 * Tone-confusable alternatives to a pinyin word: the same syllables with one syllable's
 * tone changed ("nǐ hǎo" → "nǐ hào", "ní hǎo", …). Ideal wrong answers for pinyin quizzes.
 */
export function toneVariants(pinyinText: string, max = 3): string[] {
  const syllables = pinyinText.trim().split(/\s+/);
  const out = new Set<string>();
  syllables.forEach((syl, i) => {
    for (let tone = 1; tone <= 4; tone++) {
      const changed = retone(syl, tone);
      if (!changed || changed === syl.normalize('NFC')) continue;
      out.add(syllables.map((s, j) => (j === i ? changed : s)).join(' '));
    }
  });
  // Shuffle so repeated quizzes don't always offer the same variants.
  return [...out].sort(() => Math.random() - 0.5).slice(0, max);
}
