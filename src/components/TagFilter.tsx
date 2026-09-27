import { useMemo, useState } from 'react';
import { today } from '../lib/date';
import { isLessonTag } from '../lib/planner';
import { isDueLearned, isLearned, isLeech, LEECH_FILTER } from '../lib/srs';
import type { Word } from '../lib/types';
import { tagLabel } from './TagPicker';

interface Chip {
  tag: string;
  learned: number;
  due: number;
}

/**
 * "Filter" button for Review and Practice. Only learned words count (new words belong to
 * Learn), so chip numbers always match what a session can use. Default: all learned words.
 */
export function TagFilter({
  words,
  selected,
  onChange,
  showDue = false,
}: {
  words: Word[];
  selected: string[];
  onChange(tags: string[]): void;
  /** Also show "· N due" on chips (Review). */
  showDue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const on = today();

  const { lessons, topics } = useMemo(() => {
    const learned = words.filter(isLearned);
    const chip = (tag: string, list: Word[]): Chip => ({
      tag,
      learned: list.length,
      due: list.filter((w) => isDueLearned(w, on)).length,
    });
    const tags = [...new Set(learned.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const chips = tags.map((t) => chip(t, learned.filter((w) => w.tags.includes(t))));
    const leeches = learned.filter(isLeech);
    return {
      lessons: chips.filter((c) => isLessonTag(c.tag)),
      topics: [...(leeches.length ? [chip(LEECH_FILTER, leeches)] : []), ...chips.filter((c) => !isLessonTag(c.tag))],
    };
  }, [words, on]);

  if (!lessons.length && !topics.length) return null;

  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  const summary = selected.length ? selected.map(tagLabel).join(', ') : 'All learned words';

  const group = (title: string, chips: Chip[]) =>
    chips.length > 0 && (
      <div className="filter-group">
        <span className="field-label">{title}</span>
        <div className="chips">
          {chips.map((c) => (
            <button
              key={c.tag}
              type="button"
              className={`chip ${selected.includes(c.tag) ? 'active' : ''} ${c.tag === LEECH_FILTER ? 'leech-chip' : ''}`}
              aria-pressed={selected.includes(c.tag)}
              onClick={() => toggle(c.tag)}
            >
              {c.tag === LEECH_FILTER ? '🐛 Leeches' : c.tag}
              <span className="count">
                {' '}
                · {c.learned} learned
                {showDue && c.due > 0 && ` · ${c.due} due`}
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="tag-filter">
      <button type="button" className={`filter-btn ${selected.length ? 'active' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="muted">Filter:</span> <b>{summary}</b> <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="filter-panel">
          {group('Lessons', lessons)}
          {group('Topics', topics)}
          <div className="row">
            <button type="button" className="link-btn" onClick={() => onChange([])} disabled={!selected.length}>
              All learned words
            </button>
            <button type="button" className="btn small-btn" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
