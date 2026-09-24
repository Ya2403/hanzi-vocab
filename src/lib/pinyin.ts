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
