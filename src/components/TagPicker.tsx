import { useMemo } from 'react';
import { isLeech, LEECH_FILTER } from '../lib/srs';
import type { Word } from '../lib/types';

/** Words in any of the selected categories (all words when none is selected). */
export function wordsInTags(words: Word[], selected: string[]): Word[] {
  if (!selected.length) return words;
  const tags = new Set(selected);
  return words.filter((w) => (tags.has(LEECH_FILTER) && isLeech(w)) || w.tags.some((t) => tags.has(t)));
}

export const tagLabel = (t: string) => (t === LEECH_FILTER ? 'Leeches' : t);

/**
 * Multi-select category chips. "All" clears the selection. `countOf` lets callers show
 * e.g. due counts instead of word counts.
 */
export function TagPicker({
  words,
  selected,
  onChange,
  countOf = (list) => list.length,
  label = 'Categories',
}: {
  words: Word[];
  selected: string[];
  onChange(tags: string[]): void;
  countOf?(words: Word[]): number;
  label?: string;
}) {
  const tags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words]);
  const leeches = words.filter(isLeech);
  if (!tags.length && !leeches.length) return null;

  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  const chip = (t: string, text: string, list: Word[], extra = '') => (
    <button
      key={t}
      type="button"
      className={`chip ${extra} ${selected.includes(t) ? 'active' : ''}`}
      aria-pressed={selected.includes(t)}
      onClick={() => toggle(t)}
    >
      {text} <span className="count">{countOf(list)}</span>
    </button>
  );

  return (
    <div className="field">
      <span className="field-label">
        {label} <span className="optional">{selected.length > 1 ? `${selected.length} selected` : 'pick one or more'}</span>
      </span>
      <div className="chips">
        <button type="button" className={`chip ${selected.length ? '' : 'active'}`} aria-pressed={!selected.length} onClick={() => onChange([])}>
          All <span className="count">{countOf(words)}</span>
        </button>
        {leeches.length > 0 && chip(LEECH_FILTER, '🐛 Leeches', leeches, 'leech-chip')}
        {tags.map((t) =>
          chip(
            t,
            t,
            words.filter((w) => w.tags.includes(t)),
          ),
        )}
      </div>
    </div>
  );
}
