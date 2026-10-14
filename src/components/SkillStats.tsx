import { useMemo } from 'react';
import { useStore } from '../store';
import { entryProgress, readableStats, strengthByTag, strengthCounts } from '../lib/stats';
import type { Word } from '../lib/types';

/** A small stacked bar: weak / medium / strong. */
function StrengthBar({ weak, medium, strong }: { weak: number; medium: number; strong: number }) {
  const total = weak + medium + strong;
  if (!total) return <span className="strength-bar empty" aria-hidden="true" />;
  return (
    <span className="strength-bar" aria-hidden="true">
      <span className="weak" style={{ width: `${(weak / total) * 100}%` }} />
      <span className="medium" style={{ width: `${(medium / total) * 100}%` }} />
      <span className="strong" style={{ width: `${(strong / total) * 100}%` }} />
    </span>
  );
}

/** Characters learned and words unlocked: overall and per tag. */
export function EntryProgressStats({ words }: { words: Word[] }) {
  const { all, tags } = useMemo(() => entryProgress(words), [words]);
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
  return (
    <div className="card entry-progress">
      <h2>Characters &amp; words</h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">
            {all.charsLearned}
            <span className="stat-of">/{all.chars}</span>
          </div>
          <div className="stat-label">characters learned</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {all.wordsUnlocked}
            <span className="stat-of">/{all.words}</span>
          </div>
          <div className="stat-label">words unlocked</div>
        </div>
      </div>
      <p className="muted small">A word unlocks (and comes up in exercises) once all its characters are learned.</p>
      {tags.length > 0 && (
        <div className="table-scroll">
          <table className="skill-table tag-table small">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Characters</th>
                <th>Words</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.tag}>
                  <th scope="row">{t.tag}</th>
                  <td>
                    {t.chars ? (
                      <>
                        {t.charsLearned}/{t.chars}
                        <span className="lp-bar" aria-hidden="true">
                          <span style={{ width: `${pct(t.charsLearned, t.chars)}%` }} />
                        </span>
                      </>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td>
                    {t.words ? (
                      <>
                        {t.wordsUnlocked}/{t.words}
                        <span className="lp-bar" aria-hidden="true">
                          <span style={{ width: `${pct(t.wordsUnlocked, t.words)}%` }} />
                        </span>
                      </>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Characters by strength overall and per tag, and rusty ones. */
export function SkillStats({ words }: { words: Word[] }) {
  const all = useMemo(() => strengthCounts(words), [words]);
  const tags = useMemo(() => strengthByTag(words), [words]);

  return (
    <div className="card skill-stats">
      <h2>Characters by strength</h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value strength-weak">{all.weak}</div>
          <div className="stat-label">weak</div>
        </div>
        <div className="stat">
          <div className="stat-value strength-medium">{all.medium}</div>
          <div className="stat-label">medium</div>
        </div>
        <div className="stat">
          <div className="stat-value strength-strong">{all.strong}</div>
          <div className="stat-label">strong</div>
        </div>
        <div className="stat">
          <div className="stat-value">{all.rusty}</div>
          <div className="stat-label">rusty</div>
        </div>
      </div>
      <StrengthBar {...all} />
      <p className="muted small">
        Strong: remembered for 3+ weeks. Weak: just learned, often missed, or remembered for under 3 days. Rusty: a skill
        you’re less than 70% likely to remember right now.
      </p>

      {tags.length > 0 && (
        <div className="table-scroll">
          <table className="skill-table tag-table small">
            <thead>
              <tr>
                <th>Tag</th>
                <th>New</th>
                <th>Weak</th>
                <th>Medium</th>
                <th>Strong</th>
                <th>Rusty</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.tag}>
                  <th scope="row">{t.tag}</th>
                  <td>{t.new}</td>
                  <td>{t.weak}</td>
                  <td>{t.medium}</td>
                  <td>{t.strong}</td>
                  <td>{t.rusty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

/** Readable sentences (all their words learned): overall, per dialogue and per tag. */
export function ReadableStats() {
  const { sentences, dialogues, links } = useStore();
  const stats = useMemo(() => readableStats(sentences, dialogues, links), [sentences, dialogues, links]);
  if (!sentences.length) return null;
  const pct = (r: { readable: number; total: number }) => (r.total ? (r.readable / r.total) * 100 : 0);

  return (
    <div className="card sentence-stats">
      <h2>Readable sentences</h2>
      <p className="skill-totals">
        <b>{stats.all.readable}</b> / {stats.all.total} sentences: every word in them is learned.
      </p>
      {stats.dialogues.length > 0 && (
        <ul className="dialogue-progress">
          {stats.dialogues.map((d) => (
            <li key={d.dialogue.id}>
              <div className="dp-head">
                <span lang="zh-CN">{d.dialogue.title}</span>
                {d.total > 0 && d.readable === d.total ? (
                  <span className="status ready">readable ✓</span>
                ) : (
                  <span className="muted small">
                    {d.readable}/{d.total}
                  </span>
                )}
              </div>
              <span className="lp-bar" aria-hidden="true">
                <span style={{ width: `${pct(d)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {stats.tags.length > 0 && (
        <div className="table-scroll">
          <table className="skill-table tag-table small">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Readable</th>
              </tr>
            </thead>
            <tbody>
              {stats.tags.map((t) => (
                <tr key={t.tag}>
                  <th scope="row">{t.tag}</th>
                  <td>
                    {t.readable} / {t.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
