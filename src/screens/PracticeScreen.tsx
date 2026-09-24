import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { updateSettings, useSettings } from '../lib/settings';
import { shuffle } from '../lib/words';
import { isLeech, LEECH_FILTER } from '../lib/srs';
import type { Word } from '../lib/types';
import { Session } from '../components/Session';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { Segmented } from '../components/Segmented';

type Count = '10' | '20' | '50' | 'all';

export function PracticeScreen() {
  const { words } = useStore();
  const settings = useSettings();
  // A tag can be preselected via a link like #practice?tag=HSK1 (from the word list).
  const [tag, setTag] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('tag') ?? '');
  const [count, setCount] = useState<Count>('20');
  const [session, setSession] = useState<Word[] | null>(null);

  const tags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words]);
  const leeches = words.filter(isLeech);
  const pool = tag === LEECH_FILTER ? leeches : tag ? words.filter((w) => w.tags.includes(tag)) : words;
  const sourceLabel = tag === LEECH_FILTER ? 'Leeches' : tag;
  const size = count === 'all' ? pool.length : Math.min(pool.length, Number(count));

  if (session) {
    return (
      <Session
        title={`Practice${tag ? ` · ${sourceLabel}` : ''}`}
        words={session}
        mode={settings.practiceMode}
        direction={settings.practiceDirection}
        updateSchedule={false}
        onExit={() => setSession(null)}
      />
    );
  }

  const canStart = size > 0 && modeAvailable(settings.practiceMode, words.length);

  return (
    <section className="screen">
      <div className="card form">
        <h2>Free practice</h2>
        <p className="muted small">Drill any words without affecting your review schedule. Answers still count toward your streak.</p>
        <SessionOptions
          mode={settings.practiceMode}
          direction={settings.practiceDirection}
          onMode={(practiceMode) => updateSettings({ practiceMode })}
          onDirection={(practiceDirection) => updateSettings({ practiceDirection })}
          totalWords={words.length}
        />
        {(tags.length > 0 || leeches.length > 0) && (
          <label className="field">
            <span className="field-label">Words</span>
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All words ({words.length})</option>
              <option value={LEECH_FILTER} disabled={!leeches.length}>
                🐛 Leeches ({leeches.length})
              </option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t} ({words.filter((w) => w.tags.includes(t)).length})
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented
          label="Cards"
          value={count}
          onChange={setCount}
          options={[
            { value: '10', label: '10' },
            { value: '20', label: '20' },
            { value: '50', label: '50' },
            { value: 'all', label: 'All' },
          ]}
        />
        <button className="btn primary block" disabled={!canStart} onClick={() => setSession(shuffle(pool).slice(0, size))}>
          {size ? `Start (${size} card${size === 1 ? '' : 's'})` : 'No words to practice'}
        </button>
      </div>
    </section>
  );
}
